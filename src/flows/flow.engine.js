const conversationService = require("../modules/conversations/conversation.service");

const flows = {};

function register(flowName, stepsMap) {
  flows[flowName] = stepsMap;
}

// Entrada principal. Recibe el estado completo y devuelve { messages, error }.
// Nunca envía mensajes directamente — el caller (webhook handler) los manda.
async function handle({ conversation, message, user, hub }) {
  const flowName = conversation.currentFlow;
  const stepName = conversation.currentStep;

  if (!flowName || !flows[flowName]) {
    console.error("[flow.engine] flow no encontrado", {
      conversationId: conversation.id,
      flowName,
      stepName,
    });
    return { messages: [] };
  }

  const step = flows[flowName][stepName];

  if (!step) {
    console.error("[flow.engine] step no encontrado", {
      conversationId: conversation.id,
      flowName,
      stepName,
    });
    return { messages: [] };
  }

  const result = await step({ conversation, message, user, hub });

  await _applyTransition(conversation, result);

  return {
    messages: result.messages ?? [],
    error: result.error ?? null,
  };
}

async function _applyTransition(conversation, result) {
  const patch = result.contextPatch ?? {};

  if (result.done) {
    await conversationService.completeConversation(conversation.id);
    return;
  }

  if (result.nextFlow) {
    await conversationService.setFlow(
      conversation.id,
      result.nextFlow,
      result.nextStep ?? "start",
      patch
    );
    return;
  }

  if (result.nextStep) {
    await conversationService.setStep(conversation.id, result.nextStep, patch);
    return;
  }

  if (Object.keys(patch).length > 0) {
    await conversationService.setStep(conversation.id, conversation.currentStep, patch);
  }
}

module.exports = { register, handle };
