const hubService   = require("../modules/hubs/hub.service");
const userService  = require("../modules/users/user.service");
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
            text: `En su zona aún no hay un hub activo, pero ${founderName} está organizando uno llamado "${pendingHub.name}". ${interestedText}. Se activará cuando lleguen a 5.`,
          },
          {
            type: "buttons",
            text: "¿Qué desea hacer?",
            buttons: [
              { id: "join_pending", title: "Unirme como interesado" },
              { id: "found_own",    title: "Fundar mi propio hub"   },
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
          text: "En su zona aún no hay un hub activo ni en formación. ¿Desea fundar uno usted mismo? Le enviaré un enlace para invitar a sus vecinos y el hub se activará cuando lleguen a 5 interesados.",
        },
        {
          type: "buttons",
          text: "¿Qué desea hacer?",
          buttons: [
            { id: "found_hub", title: "Sí, deseo fundarlo" },
            { id: "not_now",   title: "No por ahora"       },
          ],
        },
      ],
      contextPatch: { lat, lng },
      nextFlow: "found_hub",
      nextStep: "start",
    };
  },
};

register(FLOW_NAME, steps);

module.exports = { FLOW_NAME };
