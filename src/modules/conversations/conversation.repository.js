const prisma = require("../../infrastructure/db");

// Una conversación es "activa" si no tiene expiresAt o todavía no venció.
function findActiveByUser(userId, hubId) {
  return prisma.conversation.findFirst({
    where: {
      userId,
      ...(hubId !== undefined ? { hubId } : {}),
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });
}

function findById(id) {
  return prisma.conversation.findUnique({
    where: { id },
  });
}

function create(data) {
  return prisma.conversation.create({ data });
}

function update(id, data) {
  return prisma.conversation.update({
    where: { id },
    data,
  });
}

// Marca la conversación como vencida poniéndole expiresAt = ahora.
function expire(id) {
  return prisma.conversation.update({
    where: { id },
    data: { expiresAt: new Date() },
  });
}

module.exports = {
  findActiveByUser,
  findById,
  create,
  update,
  expire,
};
