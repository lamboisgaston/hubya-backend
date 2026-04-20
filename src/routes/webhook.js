const crypto  = require("crypto");
const express = require("express");
const router  = express.Router();

const prisma               = require("../infrastructure/db");
const { normalize }        = require("../infrastructure/meta.normalizer");
const { extractRefCode,
        handleRefCode }    = require("../infrastructure/ref-code.detector");
const userService          = require("../modules/users/user.service");
const conversationService  = require("../modules/conversations/conversation.service");
const flowEngine           = require("../flows/flow.engine");
const wpService            = require("../services/wpService");

// Registrar todos los flows al cargar el módulo.
// Cada require() ejecuta el register() al final del archivo del flow.
require("../flows/onboarding.flow");
require("../flows/share-location.flow");
require("../flows/found-hub.flow");
require("../flows/join-pending-or-found.flow");

// ── GET /webhook/whatsapp — Verificación de Meta ──────────────────────────
// Meta hace este GET cuando conectás el webhook en el panel. Devuelve el
// challenge si el verify_token coincide; 403 si no.
router.get("/whatsapp", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  console.warn("[webhook] verificación fallida — token incorrecto o mode inválido");
  return res.sendStatus(403);
});

// ── POST /webhook/whatsapp — Mensajes entrantes ───────────────────────────
router.post("/whatsapp", (req, res) => {
  // Verificar firma ANTES de responder 200. Si la firma es inválida, no procesamos.
  if (!verifySignature(req)) {
    console.warn("[webhook] firma HMAC inválida", { ip: req.ip });
    return res.sendStatus(403);
  }

  // Meta exige respuesta rápida. Respondemos 200 y procesamos en background.
  // En PR 4, este setImmediate se reemplaza por un enqueue en BullMQ.
  res.sendStatus(200);
  setImmediate(() =>
    processMessage(req.body).catch(err =>
      console.error("[webhook] error no capturado en pipeline", { err: err.message })
    )
  );
});

// ── Verificación de firma HMAC-SHA256 ─────────────────────────────────────
function verifySignature(req) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.warn("[webhook] META_APP_SECRET no configurado — saltando verificación de firma");
    return true;
  }

  const header = req.headers["x-hub-signature-256"];
  if (!header) return false;

  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(req.rawBody ?? "")
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false; // timingSafeEqual lanza si los buffers tienen longitud distinta
  }
}

// ── Adaptador: formato de flows → formato de wpService ───────────────────
// Flows devuelven: { type, text, buttons[{id, title}] }
// wpService espera: { tipo, texto, botones[{id, label}] }
function adaptMessage(msg) {
  if (msg.type === "text") {
    return { tipo: "texto", texto: msg.text ?? "" };
  }
  if (msg.type === "buttons") {
    return {
      tipo:    "botones",
      texto:   msg.text ?? "",
      botones: (msg.buttons ?? []).map(b => ({ id: b.id, label: b.title })),
    };
  }
  // Tipos desconocidos se degradan a texto plano.
  return { tipo: "texto", texto: msg.text ?? "" };
}

// ── Pipeline principal ────────────────────────────────────────────────────
async function processMessage(body) {

  // ── Paso 1: Normalizar ─────────────────────────────────────────────────
  const normalized = normalize(body);
  if (!normalized) return; // webhook de status/delivery u otro evento sin mensaje

  // ── Paso 2: Resolver usuario ───────────────────────────────────────────
  let user;
  try {
    user = await userService.findOrCreateByPhone(normalized.from);
  } catch (err) {
    // Sin usuario validado no podemos continuar ni mandar mensaje de error útil.
    console.error("[webhook] error resolviendo usuario", {
      from: normalized.from,
      metaMessageId: normalized.metaMessageId,
      err: err.message,
    });
    return;
  }

  // ── Paso 3: Resolver o iniciar conversación ────────────────────────────
  let conversation;
  try {
    const raw = await conversationService.getOrStartConversation(user.id, null);
    // resetIfExpired devuelve null si la conversación no existe (imposible acá,
    // pero usamos ?? raw como fallback defensivo).
    conversation = (await conversationService.resetIfExpired(raw.id, 60)) ?? raw;
  } catch (err) {
    console.error("[webhook] error resolviendo conversación", {
      userId: user.id,
      metaMessageId: normalized.metaMessageId,
      err: err.message,
    });
    return;
  }

  // ── Paso 4: Idempotencia — INSERT como lock atómico ───────────────────
  // Postgres permite múltiples NULL en campos @unique, así que un
  // metaMessageId vacío rompería la idempotencia. Cortamos antes del INSERT.
  if (!normalized.metaMessageId) {
    console.warn("[webhook] mensaje sin metaMessageId, descartando", {
      type: normalized.type,
      from: normalized.from,
    });
    return;
  }

  // El constraint @unique de metaMessageId actúa como lock natural.
  // Si el mismo wamid llega dos veces (reintento de Meta), el segundo INSERT
  // lanza P2002 y salimos sin reprocesar. No hay ventana de race condition.
  try {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction:      "inbound",
        metaMessageId:  normalized.metaMessageId,
        type:           normalized.type,
        content:        normalized.text ?? null,
        payload:        body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ?? null,
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      console.warn("[webhook] mensaje ya procesado (idempotencia)", {
        metaMessageId: normalized.metaMessageId,
      });
    } else {
      console.error("[webhook] error guardando mensaje inbound", {
        metaMessageId: normalized.metaMessageId,
        conversationId: conversation.id,
        err: err.message,
      });
    }
    return;
  }

  // ── Paso 5: Actualizar lastInboundAt ───────────────────────────────────
  await conversationService.touchInbound(conversation.id).catch(err =>
    console.error("[webhook] error en touchInbound", {
      conversationId: conversation.id,
      err: err.message,
    })
  );

  // ── Paso 6: Detectar y resolver refCode ───────────────────────────────
  const refCode = extractRefCode(normalized);
  if (refCode) {
    try {
      const { messages } = await handleRefCode(user.id, refCode);
      await sendAndLog(messages, normalized.from, conversation.id);
    } catch (err) {
      console.error("[webhook] error en handleRefCode", {
        userId: user.id,
        refCode,
        err: err.message,
      });
      await sendErrorMessage(normalized.from);
    }
    return;
  }

  // ── Paso 7: Tipo no soportado — no pasa al flow engine ────────────────
  if (normalized.type === "unsupported") {
    await wpService.enviar(normalized.from, {
      tipo:  "texto",
      texto: "No puedo procesar ese tipo de contenido. Por favor escríbame un texto o comparta su ubicación.",
    }).catch(err =>
      console.error("[webhook] error enviando respuesta a tipo unsupported", { err: err.message })
    );
    return;
  }

  // ── Paso 8: Arrancar onboarding si no hay flow activo ─────────────────
  if (!conversation.currentFlow) {
    try {
      // setFlow devuelve la conversación actualizada desde DB (Prisma update
      // devuelve el row completo). Reasignamos para no mutar el objeto previo
      // y para que el engine reciba el estado real persistido en DB.
      conversation = await conversationService.setFlow(conversation.id, "onboarding", "start");
    } catch (err) {
      console.error("[webhook] error iniciando onboarding", {
        userId: user.id,
        conversationId: conversation.id,
        err: err.message,
      });
      await sendErrorMessage(normalized.from);
      return;
    }
  }

  // ── Paso 9: Ejecutar flow engine ───────────────────────────────────────
  let result;
  try {
    result = await flowEngine.handle({
      conversation,
      message: normalized,
      user,
      hub: null, // ningún flow activo usa hub todavía; se resolverá en PR 5+
    });
  } catch (err) {
    console.error("[webhook] error en flow engine", {
      userId:         user.id,
      conversationId: conversation.id,
      flow:           conversation.currentFlow,
      step:           conversation.currentStep,
      metaMessageId:  normalized.metaMessageId,
      err:            err.message,
    });
    // Construido en formato wpService directo, sin pasar por adaptMessage,
    // para que este mensaje de error salga aunque el adaptador tenga un bug.
    await wpService.enviar(normalized.from, {
      tipo:  "texto",
      texto: "Ocurrió un inconveniente al procesar su mensaje. Por favor intente nuevamente en unos momentos.",
    }).catch(e =>
      console.error("[webhook] error enviando mensaje de error del engine", { err: e.message })
    );
    return;
  }

  // ── Paso 10: Enviar respuestas y registrar outbound ────────────────────
  await sendAndLog(result.messages ?? [], normalized.from, conversation.id);
}

// ── Helper: enviar mensajes y registrarlos como outbound ─────────────────
async function sendAndLog(messages, to, conversationId) {
  for (const msg of messages) {
    try {
      await wpService.enviar(to, adaptMessage(msg));
    } catch (err) {
      console.error("[webhook] error enviando mensaje outbound", {
        to,
        tipo: msg.type,
        err: err.message,
      });
      continue; // Si falla uno, intentamos el siguiente de todas formas.
    }

    // Registrar el outbound en historial (best-effort, no bloquea si falla).
    await prisma.message.create({
      data: {
        conversationId,
        direction: "outbound",
        type:      msg.type,
        content:   msg.text ?? null,
        payload:   msg,
      },
    }).catch(err =>
      console.error("[webhook] error guardando mensaje outbound", { err: err.message })
    );
  }

  if (messages.length > 0) {
    await conversationService.touchOutbound(conversationId).catch(err =>
      console.error("[webhook] error en touchOutbound", { conversationId, err: err.message })
    );
  }
}

// ── Helper: mensaje de error genérico al usuario ──────────────────────────
// Formato wpService directo — sin pasar por adaptMessage — para que funcione
// incluso si el adaptador tiene un bug.
async function sendErrorMessage(to) {
  await wpService.enviar(to, {
    tipo:  "texto",
    texto: "Ocurrió un inconveniente al procesar su mensaje. Por favor intente nuevamente en unos momentos.",
  }).catch(err =>
    console.error("[webhook] error enviando mensaje de error genérico", { err: err.message })
  );
}

module.exports = router;
