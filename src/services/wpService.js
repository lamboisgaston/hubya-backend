// src/services/wpService.js
// Envía mensajes a WhatsApp via Meta Cloud API directa
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages

const axios = require("axios");

const VERSION  = process.env.META_API_VERSION    || "v19.0";
const PHONE_ID = process.env.META_PHONE_NUMBER_ID;
const TOKEN    = process.env.META_ACCESS_TOKEN;

const BASE = `https://graph.facebook.com/${VERSION}/${PHONE_ID}/messages`;

const headers = () => ({
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
});

// ── Enviar un mensaje según su tipo ─────────────────────
exports.enviar = async (telefono, mensaje) => {
  try {
    switch (mensaje.tipo) {
      case "texto":
        return await enviarTexto(telefono, mensaje.texto);
      case "botones":
        return await enviarBotones(telefono, mensaje.texto, mensaje.botones);
      case "lista":
        return await enviarLista(telefono, mensaje.header, mensaje.texto, mensaje.secciones);
      default:
        console.warn("Tipo de mensaje desconocido:", mensaje.tipo);
    }
  } catch (err) {
    console.error("Error enviando WP:", JSON.stringify(err.response?.data) || err.message);
    throw err;
  }
};

// ── Mensaje de texto simple ──────────────────────────────
async function enviarTexto(telefono, texto) {
  return axios.post(BASE, {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to:                telefono,
    type:              "text",
    text:              { body: texto.slice(0, 4096), preview_url: false },
  }, { headers: headers() });
}

// ── Botones interactivos (máx 3 botones de Meta) ─────────
// Si hay más de 3 opciones → usar lista automáticamente
async function enviarBotones(telefono, texto, botones) {
  if (botones.length > 3) {
    const secciones = [{
      title: "Opciones",
      rows:  botones.slice(0, 10).map(b => ({
        id:    b.id.slice(0, 200),
        title: b.label.slice(0, 24),
      })),
    }];
    return enviarLista(telefono, "HubYa", texto, secciones);
  }

  return axios.post(BASE, {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to:                telefono,
    type:              "interactive",
    interactive: {
      type: "button",
      body: { text: texto.slice(0, 1024) },
      action: {
        buttons: botones.map(b => ({
          type:  "reply",
          reply: {
            id:    b.id.slice(0, 256),
            title: b.label.slice(0, 20),
          },
        })),
      },
    },
  }, { headers: headers() });
}

// ── Lista interactiva (hasta 10 items) ───────────────────
async function enviarLista(telefono, header, texto, secciones) {
  return axios.post(BASE, {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to:                telefono,
    type:              "interactive",
    interactive: {
      type:   "list",
      header: { type: "text", text: (header || "HubYa").slice(0, 60) },
      body:   { text: texto.slice(0, 1024) },
      footer: { text: "HubYa · Inteligencia Colectiva" },
      action: {
        button:   "Ver opciones",
        sections: secciones.map(s => ({
          title: (s.title || "Opciones").slice(0, 24),
          rows:  s.rows.slice(0, 10).map(r => ({
            id:          r.id.toString().slice(0, 200),
            title:       r.title.slice(0, 24),
            description: (r.desc || "").slice(0, 72),
          })),
        })),
      },
    },
  }, { headers: headers() });
}

// ── Notificación simple de texto ─────────────────────────
exports.notificar = (telefono, texto) =>
  exports.enviar(telefono, { tipo: "texto", texto });
