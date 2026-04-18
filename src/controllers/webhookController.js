// src/controllers/webhookController.js
// Meta Cloud API envía el webhook con formato diferente a 360dialog

const flowService  = require("../services/flowService");
const wpService    = require("../services/wpService");
const sesionRepo   = require("../services/sesionService");

// ── GET: Meta verifica el webhook así ────────────────────
// GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=XXX&hub.challenge=YYY
exports.verify = (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log("✅ Webhook de Meta verificado");
    return res.status(200).send(challenge); // Meta espera el challenge como respuesta plain text
  }

  console.warn("❌ Verificación de webhook fallida — token incorrecto");
  res.sendStatus(403);
};

// ── POST: Meta envía mensajes entrantes ──────────────────
exports.receive = async (req, res) => {
  // Meta necesita 200 inmediatamente o reintenta
  res.sendStatus(200);

  try {
    const body = req.body;

    // Meta envuelve todo en entry[].changes[].value
    const entries = body?.entry || [];

    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        // Ignorar status updates (delivered, read, etc.)
        if (value.statuses) continue;

        const messages = value.messages || [];

        for (const msg of messages) {
          const telefono = msg.from;   // ej: "5491112345678"
          const tipo     = msg.type;   // text | interactive | button | image | document

          console.log(`📩 [${telefono}] tipo: ${tipo}`);

          // Parsear input del usuario
          let input = null;

          if (tipo === "text") {
            input = { tipo: "texto", valor: msg.text?.body?.trim() || "" };
          } else if (tipo === "interactive") {
            const inter = msg.interactive;
            if (inter.type === "button_reply") {
              const id = inter.button_reply.id;
              console.log(`🔘 [${telefono}] button_reply id: ${id}`);
              input = { tipo: "boton", valor: id, label: inter.button_reply.title };
            } else if (inter.type === "list_reply") {
              const id = inter.list_reply.id;
              console.log(`📋 [${telefono}] list_reply id: ${id}`);
              input = { tipo: "lista", valor: id, label: inter.list_reply.title };
            }
          } else if (tipo === "location") {
            input = {
              tipo:  "ubicacion",
              valor: `${msg.location.latitude},${msg.location.longitude}`,
              lat:   msg.location.latitude,
              lng:   msg.location.longitude,
            };
          } else if (tipo === "image" || tipo === "document") {
            // El usuario mandó una foto/PDF (factura, comprobante)
            input = {
              tipo:      "archivo",
              valor:     "archivo_recibido",
              mediaId:   msg[tipo]?.id,
              mediaType: tipo,
            };
          } else {
            // Tipo no soportado, ignorar
            continue;
          }

          if (!input) continue;

          // Cargar sesión
          const sesion = await sesionRepo.obtenerOCrear(telefono);

          // Procesar en el motor de flujo
          const respuesta = await flowService.procesar(sesion, input);

          // Enviar respuestas al usuario
          for (const m of respuesta.mensajes) {
            await wpService.enviar(telefono, m);
          }

          // Notificaciones push a terceros (ej: proveedores en vínculo doble de servicios)
          if (respuesta.notificar) {
            for (const { destinatario, mensaje } of respuesta.notificar) {
              await wpService.notificar(destinatario, mensaje);
            }
          }

          // Guardar nuevo estado
          await sesionRepo.guardar(telefono, respuesta.nuevoStep, respuesta.nuevoCtx);
        }
      }
    }
  } catch (err) {
    console.error("❌ Error procesando webhook:", err.message);
  }
};
