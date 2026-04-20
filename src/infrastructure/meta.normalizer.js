/**
 * meta.normalizer.js
 *
 * Función pura que traduce el payload crudo de Meta WhatsApp Cloud API
 * al formato interno { type, text, location, buttonId, from, metaMessageId }
 * que espera el flow engine.
 *
 * No toca base de datos. No lanza excepciones. Si el payload es irrelevante
 * o malformado devuelve null.
 *
 * ─── Casos y ejemplos ──────────────────────────────────────────────────────
 *
 * CASO 1 — Sin mensaje (webhook de status/delivery)
 *   Input:  body sin messages (solo statuses o value.messages vacío)
 *   Output: null
 *
 * CASO 2 — Mensaje de texto
 *   Input:  { ..., messages: [{ id: "wamid.A", from: "549...", type: "text",
 *               text: { body: "Hola" } }] }
 *   Output: { type: "text", text: "Hola", location: null, buttonId: null,
 *             from: "549...", metaMessageId: "wamid.A" }
 *
 * CASO 3 — Mensaje de ubicación
 *   Input:  { ..., messages: [{ id: "wamid.B", from: "549...", type: "location",
 *               location: { latitude: -34.6, longitude: -58.4 } }] }
 *   Output: { type: "location", text: null, location: { lat: -34.6, lng: -58.4 },
 *             buttonId: null, from: "549...", metaMessageId: "wamid.B" }
 *   Si raw.location viene vacío/ausente: output es igual pero con location: null.
 *
 * CASO 4 — Respuesta de botón interactivo
 *   Input:  { ..., messages: [{ id: "wamid.C", from: "549...", type: "interactive",
 *               interactive: { type: "button_reply",
 *                 button_reply: { id: "found_hub", title: "Sí, deseo fundarlo" } } }] }
 *   Output: { type: "button_reply", text: null, location: null,
 *             buttonId: "found_hub", from: "549...", metaMessageId: "wamid.C" }
 *
 * CASO 5 — Respuesta de lista interactiva
 *   Input:  { ..., messages: [{ id: "wamid.D", from: "549...", type: "interactive",
 *               interactive: { type: "list_reply",
 *                 list_reply: { id: "operate_solo", title: "Operar solo" } } }] }
 *   Output: { type: "button_reply", text: null, location: null,
 *             buttonId: "operate_solo", from: "549...", metaMessageId: "wamid.D" }
 *
 * CASO 6 — Tipo no soportado (imagen, audio, video, sticker, interactive subtipo
 *           desconocido como nfm_reply, etc.)
 *   Input:  { ..., messages: [{ id: "wamid.E", from: "549...", type: "image", ... }] }
 *   Output: { type: "unsupported", text: null, location: null, buttonId: null,
 *             from: "549...", metaMessageId: "wamid.E" }
 */

/**
 * Extrae el primer mensaje del payload de Meta y lo normaliza.
 * @param {object} body  El body completo del POST de Meta.
 * @returns {{ type: string, text: string|null, location: {lat:number,lng:number}|null,
 *             buttonId: string|null, from: string, metaMessageId: string } | null}
 */
function normalize(body) {
  let value;
  try {
    value = body?.entry?.[0]?.changes?.[0]?.value;
  } catch (err) {
    console.error("[meta.normalizer] payload malformado", { err: err.message });
    return null;
  }

  if (!value) return null;

  const messages = value.messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;

  if (messages.length > 1) {
    console.warn("[meta.normalizer] múltiples mensajes en el payload, procesando solo el primero", {
      count: messages.length,
    });
  }

  const raw = messages[0];

  const base = {
    from:          String(raw.from ?? ""),
    metaMessageId: String(raw.id  ?? ""),
  };

  switch (raw.type) {
    case "text":
      return {
        ...base,
        type:     "text",
        text:     raw.text?.body ?? null,
        location: null,
        buttonId: null,
      };

    case "location":
      return {
        ...base,
        type:     "location",
        text:     null,
        location: raw.location
          ? { lat: raw.location.latitude, lng: raw.location.longitude }
          : null,
        buttonId: null,
      };

    case "interactive": {
      const subtype = raw.interactive?.type;

      if (subtype === "button_reply") {
        return {
          ...base,
          type:     "button_reply",
          text:     null,
          location: null,
          buttonId: raw.interactive.button_reply?.id ?? null,
        };
      }

      if (subtype === "list_reply") {
        return {
          ...base,
          type:     "button_reply",
          text:     null,
          location: null,
          buttonId: raw.interactive.list_reply?.id ?? null,
        };
      }

      // Subtype desconocido (e.g. nfm_reply de WhatsApp Flows): tratar como unsupported.
      console.warn("[meta.normalizer] interactive subtype desconocido", {
        subtype,
        metaMessageId: base.metaMessageId,
      });
      return { ...base, type: "unsupported", text: null, location: null, buttonId: null };
    }

    default:
      return { ...base, type: "unsupported", text: null, location: null, buttonId: null };
  }
}

module.exports = { normalize };
