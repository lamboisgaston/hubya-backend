const conversationRepository = require("./conversation.repository");

async function getOrStartConversation(userId, hubId) {
  const existing = await conversationRepository.findActiveByUser(userId, hubId);
  if (existing) return existing;

  return conversationRepository.create({
    userId,
    hubId: hubId ?? null,
    lastInboundAt: new Date(),
  });
}

async function setFlow(conversationId, flow, step, contextPatch = {}) {
  const conv = await conversationRepository.findById(conversationId);
  const mergedContext = { ...conv.context, ...contextPatch };

  return conversationRepository.update(conversationId, {
    currentFlow: flow,
    currentStep: step,
    context: mergedContext,
  });
}

async function setStep(conversationId, step, contextPatch = {}) {
  const conv = await conversationRepository.findById(conversationId);
  const mergedContext = { ...conv.context, ...contextPatch };

  return conversationRepository.update(conversationId, {
    currentStep: step,
    context: mergedContext,
  });
}

async function completeConversation(conversationId) {
  return conversationRepository.expire(conversationId);
}

// Resetea el estado de la conversación si el usuario no mandó nada
// en los últimos maxInactivityMinutes. No la borra: la deja limpia
// para que el próximo mensaje arranque desde cero.
async function resetIfExpired(conversationId, maxInactivityMinutes) {
  const conv = await conversationRepository.findById(conversationId);
  if (!conv) return null;

  const lastActivity = conv.lastInboundAt ?? conv.createdAt;
  const inactiveMs = Date.now() - new Date(lastActivity).getTime();
  const limitMs = maxInactivityMinutes * 60 * 1000;

  if (inactiveMs < limitMs) return conv;

  return conversationRepository.update(conversationId, {
    currentFlow: null,
    currentStep: null,
    context: {},
    expiresAt: null,
  });
}

module.exports = {
  getOrStartConversation,
  setFlow,
  setStep,
  completeConversation,
  resetIfExpired,
};
