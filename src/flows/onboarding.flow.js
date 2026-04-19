const userService = require("../modules/users/user.service");
const { register } = require("./flow.engine");

const FLOW_NAME = "onboarding";

const steps = {
  start: async () => {
    return {
      messages: [
        {
          type: "text",
          text: "👋 ¡Hola! Bienvenido a *HubYa* — el marketplace de tu barrio por WhatsApp.\n\nPara empezar, ¿cuál es tu nombre completo?",
        },
      ],
      nextStep: "await_name",
    };
  },

  await_name: async ({ message, user }) => {
    const VALIDATION_ERRORS = new Set(["name_too_short", "name_invalid_type"]);

    let updatedUser;
    try {
      updatedUser = await userService.setDisplayName(user.id, message.text ?? "");
    } catch (err) {
      if (VALIDATION_ERRORS.has(err.message)) {
        return {
          messages: [
            {
              type: "text",
              text: "Ese nombre no me parece válido, ¿podés mandarme uno de al menos 2 caracteres?",
            },
          ],
        };
      }
      throw err;
    }

    const name = updatedUser.fullName;

    return {
      messages: [
        {
          type: "text",
          text: `¡Genial, ${name}! 🙌\n\nAhora necesito tu ubicación para encontrar el hub más cercano a vos.\n\nCompartí tu ubicación desde WhatsApp tocando el clip 📎 → Ubicación.`,
        },
      ],
      contextPatch: { name },
      nextFlow: "share_location",
      nextStep: "await_location",
    };
  },
};

register(FLOW_NAME, steps);

module.exports = { FLOW_NAME };
