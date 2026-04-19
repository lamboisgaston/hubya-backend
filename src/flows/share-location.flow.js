const hubService        = require("../modules/hubs/hub.service");
const { FOUNDER_THRESHOLD } = hubService;
const userService       = require("../modules/users/user.service");
const { register } = require("./flow.engine");

const FLOW_NAME = "share_location";

const steps = {
  // Emisión pura: envía el pedido de ubicación y avanza el paso sin esperar respuesta.
  // Se usa cuando el flow se activa directamente (no desde onboarding, que ya pide la ubicación).
  start: async ({ user }) => {
    const name = user.fullName ?? "vecino";
    return {
      messages: [
        {
          type: "text",
          text: `Perfecto, ${name}. Por favor comparta su ubicación para buscar un hub cercano a su domicilio. Puede usar el botón de adjuntar 📎 → Ubicación.`,
        },
      ],
      nextStep: "await_location",
    };
  },

  await_location: async ({ message, user }) => {
    if (message.type !== "location") {
      return {
        messages: [
          {
            type: "text",
            text: "Lamentablemente no recibí una ubicación válida. Por favor comparta su ubicación usando el botón de adjuntar 📎 → Ubicación.",
          },
        ],
      };
    }

    const { lat, lng } = message.location;
    const { active, pending } = await hubService.findHubsForLocation(lat, lng);

    // ── RAMA A — hay al menos un hub activo cercano ───────────────────────────
    if (active.length > 0) {
      const nearestHub = active[0];

      await hubService.joinActiveHub(user.id, nearestHub.id);

      return {
        messages: [
          {
            type: "text",
            text: `Hemos encontrado el hub "${nearestHub.name}" en su zona. Ya lo hemos sumado como vecino. Desde ahora podrá hacer pedidos y recibir novedades del hub.`,
          },
        ],
        done: true,
      };
    }

    // ── RAMA B — no hay hub activo, pero sí hay uno pendiente ────────────────
    if (pending.length > 0) {
      const pendingHub = pending[0];

      let founderName = "un vecino";
      try {
        const founder = await userService.findById(pendingHub.createdByUserId);
        if (founder?.fullName) founderName = founder.fullName;
      } catch (_) {
        // Si la búsqueda del fundador falla, continuamos con el nombre genérico.
      }

      const interestedCount = Number(pendingHub.memberships_count ?? 0);
      const interestedText =
        interestedCount === 0
          ? "Aún no hay vecinos interesados"
          : interestedCount === 1
          ? "Ya hay 1 vecino interesado"
          : `Ya hay ${interestedCount} vecinos interesados`;

      return {
        messages: [
          {
            type: "text",
            text: `En su zona aún no hay un hub activo, pero ${founderName} está organizando uno llamado "${pendingHub.name}". ${interestedText}. Se activará cuando lleguen a ${FOUNDER_THRESHOLD} vecinos interesados.`,
          },
          {
            type: "buttons",
            text: "¿Qué desea hacer?",
            buttons: [
              { id: "join_pending",  title: "Unirme como interesado" },
              { id: "found_own",     title: "Fundar mi propio hub"   },
              { id: "operate_solo",  title: "Operar solo"            },
            ],
          },
        ],
        contextPatch: {
          pending_hub_id:   pendingHub.id,
          pending_hub_name: pendingHub.name,
          founder_name:     founderName,
          lat,
          lng,
        },
        nextFlow: "join_pending_or_found",
        nextStep: "start",
      };
    }

    // ── RAMA C — no hay nada cercano ─────────────────────────────────────────
    return {
      messages: [
        {
          type: "text",
          text: `En su zona aún no hay un hub activo ni en formación. ¿Desea fundar uno usted mismo? Le enviaré un enlace para invitar a sus vecinos y el hub se activará cuando lleguen a ${FOUNDER_THRESHOLD} vecinos interesados.`,
        },
        {
          type: "buttons",
          text: "¿Qué desea hacer?",
          buttons: [
            { id: "found_hub",    title: "Sí, deseo fundarlo" },
            { id: "operate_solo", title: "Operar solo"        },
            { id: "not_now",      title: "No por ahora"       },
          ],
        },
      ],
      contextPatch: { lat, lng },
      nextStep: "await_no_hub_choice",
    };
  },
  // Espera la elección del usuario en Rama C (sin hub cercano).
  // Lee lat/lng del context porque el mensaje entrante es un buttonId, no una ubicación.
  await_no_hub_choice: async ({ message, user, conversation }) => {
    const { lat, lng } = conversation.context ?? {};

    if (typeof lat !== "number" || typeof lng !== "number") {
      return {
        messages: [{ type: "text", text: "Lo sentimos, ocurrió un error con su ubicación. Por favor intente nuevamente compartiendo su ubicación." }],
        done: true,
      };
    }

    const buttonId = message.buttonId;

    if (buttonId === "found_hub") {
      return { nextFlow: "found_hub", nextStep: "start" };
    }

    if (buttonId === "operate_solo") {
      await userService.markAsIndividual(user.id, lat, lng);
      return {
        messages: [{ type: "text", text: "Perfecto. Lo hemos registrado como vecino individual. Podrá comprar productos y contratar servicios. Le avisaremos si aparece un hub en su zona." }],
        done: true,
      };
    }

    if (buttonId === "not_now") {
      return {
        messages: [{ type: "text", text: "Entendido. Puede volver a escribirnos cuando desee." }],
        done: true,
      };
    }

    // Fallback: respuesta inesperada, reenviar opciones.
    return {
      messages: [
        {
          type: "buttons",
          text: "Por favor elija una de las opciones:",
          buttons: [
            { id: "found_hub",    title: "Sí, deseo fundarlo" },
            { id: "operate_solo", title: "Operar solo"        },
            { id: "not_now",      title: "No por ahora"       },
          ],
        },
      ],
    };
  },
};

register(FLOW_NAME, steps);

module.exports = { FLOW_NAME };
