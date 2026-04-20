/**
 * ref-code.detector.js
 *
 * Detecta si un mensaje normalizado contiene un refCode de hub y, si lo
 * encuentra, lo resuelve llamando a hubService antes de entrar al flow engine.
 *
 * Dos funciones públicas:
 *   extractRefCode(normalizedMessage) → string | null   (pura, sincrónica)
 *   handleRefCode(userId, refCode)    → { messages }    (async, llama a hubService)
 *
 * Lo que este módulo NO hace (responsabilidad del webhook en 3c.3.c):
 *   - Verificar idempotencia por metaMessageId.
 *   - Resolver / crear el usuario en DB.
 *   - Actualizar la conversación (lastInboundAt, flow, step).
 *   - Registrar el mensaje en la tabla messages.
 *   - Enviar mensajes a WhatsApp (devuelve los mensajes, el webhook los envía).
 */

const hubService = require("../modules/hubs/hub.service");

// Formato generado por hub.service.js: "hub_" + 8 chars base62 [0-9A-Za-z].
// {6,} exige al menos 6 chars alfanuméricos para reducir falsos positivos
// con textos como "hub_ok". Sin máximo para tolerar cambios futuros de longitud.
const REF_CODE_REGEX = /\bhub_[A-Za-z0-9]{6,}\b/;

/**
 * Extrae el primer refCode encontrado en el texto de un mensaje normalizado.
 * Solo opera sobre mensajes de tipo "text"; cualquier otro tipo devuelve null.
 * Si el texto contiene múltiples códigos (ej: "hub_AAA12345 y hub_BBB67890"),
 * se usa el primero y se ignoran los demás.
 *
 * @param {{ type: string, text: string|null }} normalizedMessage
 * @returns {string|null}
 */
function extractRefCode(normalizedMessage) {
  if (normalizedMessage?.type !== "text") return null;
  if (!normalizedMessage.text) return null;

  const match = normalizedMessage.text.match(REF_CODE_REGEX);
  return match ? match[0] : null;
}

/**
 * Resuelve un refCode para un usuario dado: suma al usuario al hub
 * correspondiente y devuelve los mensajes de respuesta para el webhook.
 *
 * Errores de negocio conocidos (REF_CODE_NO_ENCONTRADO, HUB_NO_DISPONIBLE)
 * se convierten en mensajes amables. Cualquier otro error burbujea al
 * handler global del webhook.
 *
 * TODO: cuando exista el menú del vecino en el flow engine, los casos
 * exitosos (joined, activated) deberían incluir el menú como segundo
 * mensaje, no solo texto plano.
 *
 * @param {string} userId
 * @param {string} refCode
 * @returns {Promise<{ messages: Array<{ type: string, text: string }> }>}
 */
async function handleRefCode(userId, refCode) {
  let result;
  try {
    result = await hubService.joinByRefCode(userId, refCode);
  } catch (err) {
    if (err.message === "REF_CODE_NO_ENCONTRADO") {
      return {
        messages: [
          {
            type: "text",
            text: "No encontramos ningún hub con ese código. Por favor verifique que lo haya escrito correctamente.",
          },
        ],
      };
    }

    if (err.message === "HUB_NO_DISPONIBLE") {
      return {
        messages: [
          {
            type: "text",
            text: "El hub al que hace referencia ese código ya no está disponible. Si lo desea, puede compartir su ubicación para buscar otros hubs en su zona o fundar uno nuevo.",
          },
        ],
      };
    }

    throw err;
  }

  // El usuario ya era miembro (hub activo o pendiente).
  if (result.alreadyMember) {
    const hubName = result.hub?.name ?? "ese hub";
    return {
      messages: [
        {
          type: "text",
          text: `Ya es miembro de "${hubName}". No es necesario hacer nada más.`,
        },
      ],
    };
  }

  // Unión a hub pendiente que, con esta adhesión, se activó automáticamente.
  if (result.joined && result.activated) {
    const hubName = result.hub?.name ?? "el hub";
    return {
      messages: [
        {
          type: "text",
          text: `¡Su adhesión activó el hub "${hubName}"! Ya puede comenzar a operar como vecino.`,
        },
      ],
    };
  }

  // Unión a hub pendiente sin activación: informa el estado actual.
  if (result.joined && !result.activated && result.memberCount !== undefined) {
    const hubName = result.hub?.name ?? "el hub";
    const count   = result.memberCount;
    return {
      messages: [
        {
          type: "text",
          text: `Fue registrado como interesado en el hub "${hubName}". Actualmente hay ${count} vecino${count === 1 ? "" : "s"} anotado${count === 1 ? "" : "s"}. El hub se activa al llegar a 2 interesados.`,
        },
      ],
    };
  }

  // Unión exitosa a hub activo.
  if (result.joined) {
    const hubName = result.hub?.name ?? "el hub";
    return {
      messages: [
        {
          type: "text",
          text: `Fue sumado al hub "${hubName}" como vecino. Ya puede comenzar a operar.`,
        },
      ],
    };
  }

  // Fallback defensivo: resultado inesperado de joinByRefCode.
  console.warn("[ref-code.detector] resultado inesperado de joinByRefCode", { userId, refCode, result });
  return {
    messages: [
      {
        type: "text",
        text: "Procesamos su código pero no pudimos determinar el estado actual. Por favor intente nuevamente o escriba al soporte.",
      },
    ],
  };
}

module.exports = { extractRefCode, handleRefCode };
