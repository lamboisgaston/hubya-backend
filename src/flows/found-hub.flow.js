const hubService        = require("../modules/hubs/hub.service");
const { FOUNDER_THRESHOLD } = hubService;
const { register }      = require("./flow.engine");

const FLOW_NAME = "found_hub";

const META_PHONE = process.env.META_PHONE_NUMBER;
if (!META_PHONE) {
  console.warn("[found-hub.flow] META_PHONE_NUMBER no está configurado. El link usará placeholder.");
}

const steps = {
  start: async () => {
    return {
      messages: [
        { type: "text", text: "Perfecto. Vamos a fundar su hub. ¿Qué nombre desea ponerle?" },
      ],
      nextStep: "await_name",
    };
  },

  await_name: async ({ message }) => {
    const text = typeof message.text === "string" ? message.text.trim() : "";

    if (text.length < 2) {
      return {
        messages: [
          { type: "text", text: "El nombre debe tener al menos 2 caracteres. Por favor escriba el nombre de su hub." },
        ],
      };
    }

    return {
      messages: [
        { type: "text", text: `Excelente. Ahora escriba una descripción breve del hub "${text}" (mínimo 10 caracteres).` },
      ],
      contextPatch: { hub_name: text },
      nextStep: "await_description",
    };
  },

  await_description: async ({ message, user, conversation }) => {
    const text = typeof message.text === "string" ? message.text.trim() : "";

    if (text.length < 10) {
      return {
        messages: [
          { type: "text", text: "La descripción debe tener al menos 10 caracteres. Por favor escriba una descripción para su hub." },
        ],
      };
    }

    const { lat, lng, hub_name } = conversation.context ?? {};

    if (typeof lat !== "number" || typeof lng !== "number") {
      return {
        messages: [
          { type: "text", text: "Lo sentimos, ocurrió un error con su ubicación. Por favor intente nuevamente compartiendo su ubicación." },
        ],
        done: true,
      };
    }

    let hub;
    try {
      hub = await hubService.foundHub(user.id, { name: hub_name, description: text }, lat, lng);
    } catch (err) {
      if (err.message === "YA_TIENE_HUB_PENDIENTE") {
        return {
          messages: [
            { type: "text", text: "Usted ya tiene un hub en formación. Solo puede tener un hub pendiente a la vez. Si desea gestionar ese hub, escríbanos y lo ayudamos." },
          ],
          done: true,
        };
      }
      if (err.message === "HUB_CERCANO_EXISTENTE") {
        return {
          messages: [
            { type: "text", text: "Ya existe un hub activo o en formación muy cerca de su ubicación. Comparta su ubicación nuevamente para ver las opciones disponibles en su zona." },
          ],
          done: true,
        };
      }
      throw err;
    }

    const link = `https://wa.me/${META_PHONE || "NUMERO_NO_CONFIGURADO"}?text=${encodeURIComponent("Quiero sumarme a un hub " + hub.refCode)}`;

    return {
      messages: [
        {
          type: "text",
          text: `✅ Su hub "${hub.name}" fue creado.`,
        },
        {
          type: "text",
          text:
            `🔑 Código para invitar vecinos: ${hub.refCode}\n\n` +
            `📲 Link para compartir por WhatsApp:\n${link}\n\n` +
            `Explique a sus vecinos que pueden:\n` +
            `• Abrir el link y mandar el mensaje que se arma solo, o\n` +
            `• Escribirle al bot al número ${META_PHONE || "NUMERO_NO_CONFIGURADO"} y mandar el código ${hub.refCode}.\n\n` +
            `Su hub se activará cuando ${FOUNDER_THRESHOLD} vecinos se sumen como interesados.`,
        },
      ],
      done: true,
    };
  },
};

register(FLOW_NAME, steps);

module.exports = { FLOW_NAME };
