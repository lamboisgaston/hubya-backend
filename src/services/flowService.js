// src/services/flowService.js
// Motor de conversación HubYa

const wpService = require("./wpService");

// ── Entrada principal ────────────────────────────────────
exports.procesar = async (sesion, input) => {
  const step = sesion.step || "start";
  const ctx  = sesion.ctx  || {};

  // Comandos globales
  const texto = (input.valor || "").toLowerCase().trim();
  if (texto === "menu" || texto === "hola" || texto === "inicio") {
    return menuPrincipal();
  }

  // Resolver por step
  switch (step) {

    case "start":
      return menuPrincipal();

    case "servicios":
      return {
        nuevoStep: "servicios",
        nuevoCtx:  ctx,
        mensajes: [{
          tipo: "botones",
          texto: "🛠️ *Servicios disponibles*\n\n¿Qué servicio necesitás?",
          botones: [
            { id: "jardineros", label: "🌿 JardinerosYA"   },
            { id: "fumigacion", label: "🐛 FumigadoresYA"  },
            { id: "start",      label: "⬅️ Volver"         },
          ],
        }],
      };

    case "compras":
      return {
        nuevoStep: "compras",
        nuevoCtx:  ctx,
        mensajes: [{
          tipo: "botones",
          texto: "🛒 *Compras colectivas*\n\nUníte a la ronda de tu hub y conseguí mejores precios.",
          botones: [
            { id: "huevero",   label: "🥚 HueveroYA"    },
            { id: "verdulero", label: "🥦 VerduleroyA"   },
            { id: "start",     label: "⬅️ Volver"        },
          ],
        }],
      };

    default:
      return menuPrincipal();
  }
};

// ── Menú principal ───────────────────────────────────────
function menuPrincipal() {
  return {
    nuevoStep: "start",
    nuevoCtx:  {},
    mensajes: [{
      tipo: "botones",
      texto: "👋 *Bienvenido a HubYa*\n_Inteligencia Colectiva Barrial_\n\n¿Qué querés hacer hoy?",
      botones: [
        { id: "servicios", label: "🛠️ Servicios"         },
        { id: "compras",   label: "🛒 Compras colectivas" },
        { id: "mi_hub",    label: "🏘️ Mi Hub"             },
      ],
    }],
  };
}
