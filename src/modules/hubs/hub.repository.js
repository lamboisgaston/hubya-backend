const { Prisma } = require("@prisma/client");
const prisma = require("../../infrastructure/db");

// Busca hubs dentro de un radio dado usando la fórmula de Haversine (distancia en la superficie de la Tierra).
// statuses es un array, ej: ['active'] o ['active', 'pending'].
// Devuelve los hubs ordenados de más cercano a más lejano, con distance_meters incluido.
async function findNearby(lat, lng, radiusMeters, statuses = ["active"]) {
  return prisma.$queryRaw(Prisma.sql`
    SELECT * FROM (
      SELECT
        id, slug, name, description, status, lat, lng,
        "radiusMeters", "refCode", "createdByUserId", "createdAt",
        (6371000 * 2 * asin(sqrt(
          pow(sin(radians((lat  - ${lat})  / 2.0)), 2) +
          cos(radians(${lat})) * cos(radians(lat)) *
          pow(sin(radians((lng  - ${lng})  / 2.0)), 2)
        ))) AS distance_meters
      FROM hubs
      WHERE "deletedAt" IS NULL
        AND lat IS NOT NULL
        AND lng IS NOT NULL
    ) sub
    WHERE distance_meters <= ${radiusMeters}
      AND status::text IN (${Prisma.join(statuses)})
    ORDER BY distance_meters ASC
  `);
}

// Busca un hub por su código de invitación (ref_code).
function findByRefCode(refCode) {
  return prisma.hub.findUnique({
    where: { refCode },
  });
}

// Busca un hub por su UUID.
function findById(id) {
  return prisma.hub.findUnique({
    where: { id },
  });
}

// Devuelve el hub pendiente que este usuario fundó, si existe.
// Sirve para bloquear a alguien que quiere fundar un segundo hub pendiente.
function findPendingByFounder(userId) {
  return prisma.hub.findFirst({
    where: {
      createdByUserId: userId,
      status: "pending",
      deletedAt: null,
    },
  });
}

// Crea un hub nuevo.
function create(data) {
  return prisma.hub.create({ data });
}

// Actualiza campos de un hub (status, name, description, etc.).
function update(id, data) {
  return prisma.hub.update({
    where: { id },
    data,
  });
}

// Cuenta los memberships activos de un hub.
// Se usa para saber si el hub llegó al umbral de activación.
function countMembers(hubId) {
  return prisma.membership.count({
    where: { hubId, active: true },
  });
}

// Devuelve el membership activo de un usuario en un hub, si existe.
// Se usa para evitar sumarlo dos veces (idempotencia).
function findMembership(userId, hubId) {
  return prisma.membership.findFirst({
    where: { userId, hubId, active: true },
  });
}

// Crea un membership para un usuario en un hub con el rol y metadata dados.
function createMembership(userId, hubId, role, metadata = {}) {
  return prisma.membership.create({
    data: { userId, hubId, role, metadata },
  });
}

module.exports = {
  findNearby,
  findByRefCode,
  findById,
  findPendingByFounder,
  create,
  update,
  countMembers,
  findMembership,
  createMembership,
};
