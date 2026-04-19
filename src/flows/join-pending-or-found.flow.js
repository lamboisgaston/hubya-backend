const hubService            = require("../modules/hubs/hub.service");
const { FOUNDER_THRESHOLD } = hubService;
const userService           = require("../modules/users/user.service");
const { register }          = require("./flow.engine");

const FLOW_NAME = "join_pending_or_found";

const steps = {
  start: async ({ message, user, conversation }) => {
    const context = conversation.context ?? {};

    if (!context.pending_hub_id) {
      return {
        messages: [
          { type: "text", text: "Lo sentimos, ocurrió un error al recuperar el hub. Por favor comparta su ubicación nuevamente para continuar." },
        ],
        done: true,
      };
    }

    const buttonId = message.buttonId;

    // ── join_pending — sumarse como interesado al hub pendiente ──────────────
    if (buttonId === "join_pending") {
      const result = await hubService.joinPendingHub(user.id, context.pending_hub_id);

      if (result.alreadyMember) {
        return {
          messages: [
            { type: "text", text: `Ya figura como interesado en el hub "${context.pending_hub_name}". Le avisaremos cuando se active.` },
          ],
          done: true,
        };
      }

      if (result.activated) {
        return {
          messages: [
            { type: "text", text: `¡Se ha activado el hub "${context.pending_hub_name}"! Usted es uno de los ${FOUNDER_THRESHOLD} vecinos que lo hicieron posible. Desde ahora podrá hacer pedidos grupales y acceder a los servicios del hub.` },
          ],
          done: true,
        };
      }

      const remaining = FOUNDER_THRESHOLD - result.memberCount;
      const remainingText = remaining === 1 ? "1 vecino más" : `${remaining} vecinos más`;
      return {
        messages: [
          { type: "text", text: `Lo hemos sumado como interesado al hub "${context.pending_hub_name}". Cuando se sumen ${remainingText}, el hub se activará. Le avisaremos cuando eso pase.` },
        ],
        done: true,
      };
    }

    // ── found_own — el vecino prefiere fundar su propio hub ──────────────────
    if (buttonId === "found_own") {
      return {
        contextPatch: { lat: context.lat, lng: context.lng },
        nextFlow: "found_hub",
        nextStep: "start",
      };
    }

    // ── operate_solo — el vecino prefiere operar como individual ────────────
    if (buttonId === "operate_solo") {
      if (typeof context.lat !== "number" || typeof context.lng !== "number") {
        return {
          messages: [
            { type: "text", text: "Lo sentimos, ocurrió un error con su ubicación. Por favor comparta su ubicación nuevamente para continuar." },
          ],
          done: true,
        };
      }

      await userService.markAsIndividual(user.id, context.lat, context.lng);
      return {
        messages: [
          { type: "text", text: "Perfecto. Lo hemos registrado como vecino individual. Podrá comprar productos y contratar servicios. Le avisaremos si aparece un hub en su zona." },
        ],
        done: true,
      };
    }

    // ── Fallback — respuesta inesperada, reenviar opciones ───────────────────
    return {
      messages: [
        {
          type: "buttons",
          text: "Por favor elija una de las opciones:",
          buttons: [
            { id: "join_pending",  title: "Unirme como interesado" },
            { id: "found_own",     title: "Fundar mi propio hub"   },
            { id: "operate_solo",  title: "Operar solo"            },
          ],
        },
      ],
    };
  },
};

register(FLOW_NAME, steps);

module.exports = { FLOW_NAME };
