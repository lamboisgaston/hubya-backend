const prisma = require("../../infrastructure/db");

function findByPhone(phoneNumber) {
  return prisma.user.findUnique({
    where: { phoneNumber },
  });
}

function findById(id) {
  return prisma.user.findUnique({
    where: { id },
  });
}

function create(data) {
  return prisma.user.create({ data });
}

function update(id, data) {
  return prisma.user.update({
    where: { id },
    data,
  });
}

module.exports = {
  findByPhone,
  findById,
  create,
  update,
};
