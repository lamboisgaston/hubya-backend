const crypto = require("crypto");
const hubRepo = require("./hub.repository");
const eventBus = require("../../events/eventBus");
const prisma = require("../../infrastructure/db");

const ALPHABET          = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const FOUNDER_THRESHOLD = 5;     // memberships necesarios para activar un hub pendiente
const NEARBY_RADIUS_M   = 1500;  // radio de búsqueda de hubs cercanos (spec 3.2)
const OVERLAP_RADIUS_M  = 500;   // radio de solapamiento para bloquear hubs duplicados (spec 3.9)

// ── Helpers privados ──────────────────────────────────────

function generateRefCode() {
  const bytes = crypto.randomBytes(8);
  let suffix = "";
  for (const byte of bytes) suffix += ALPHABET[byte % 62];
  return `hub_${suffix}`;
}

async function tryGenerateUniqueRefCode(maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    const refCode = generateRefCode();
    const existing = await hubRepo.findByRefCode(refCode);
    if (!existing) return refCode;
  }
  throw new Error("REF_CODE_COLLISION");
}

function buildSlug(name) {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") +
    "-" +
    Date.now()
  );
}

// ── Funciones públicas ────────────────────────────────────

// Devuelve los hubs activos y pendientes dentro de 1500m de una ubicación.
// El flow de ubicación lo usa para decidir qué camino mostrarle al vecino.
async function findHubsForLocation(lat, lng) {
  const [active, pending] = await Promise.all([
    hubRepo.findNearby(lat, lng, NEARBY_RADIUS_M, ["active"]),
    hubRepo.findNearby(lat, lng, NEARBY_RADIUS_M, ["pending"]),
  ]);
  return { active, pending };
}

// Funda un hub nuevo en estado 'pending'.
// Crea el hub, el membership del fundador con metadata.founder = true, y emite hub.created_pending.
// Lanza errores con códigos específicos para que el flow los traduzca a mensajes amigables.
async function foundHub(userId, { name, description }, lat, lng) {
  // Regla: un usuario no puede fundar más de 1 hub pendiente al mismo tiempo.
  const existingPending = await hubRepo.findPendingByFounder(userId);
  if (existingPending) {
    const err = new Error("YA_TIENE_HUB_PENDIENTE");
    err.hub = existingPending;
    throw err;
  }

  // Regla: si hay un hub activo o pendiente a menos de 500m, no se crea uno nuevo.
  // Al segundo vecino se le ofrece sumarse al existente.
  const nearby = await hubRepo.findNearby(lat, lng, OVERLAP_RADIUS_M, ["active", "pending"]);
  if (nearby.length > 0) {
    const err = new Error("HUB_CERCANO_EXISTENTE");
    err.hub = nearby[0];
    throw err;
  }

  const refCode = await tryGenerateUniqueRefCode();

  const hub = await hubRepo.create({
    slug: buildSlug(name),
    name,
    description: description || null,
    lat,
    lng,
    status: "pending",
    refCode,
    createdByUserId: userId,
  });

  await hubRepo.createMembership(userId, hub.id, "vecino", { founder: true });

  eventBus.emit("hub.created_pending", { hubId: hub.id, userId });

  return hub;
}

// Suma un vecino como interesado a un hub pendiente.
// Si con este vecino el hub llega a FOUNDER_THRESHOLD miembros, lo activa automáticamente.
async function joinPendingHub(userId, hubId) {
  // Idempotencia: si el vecino ya es miembro, no hacer nada.
  const alreadyMember = await hubRepo.findMembership(userId, hubId);
  if (alreadyMember) return { joined: false, activated: false, alreadyMember: true };

  await hubRepo.createMembership(userId, hubId, "vecino", { interested_in_pending: true });
  eventBus.emit("hub.interested_added", { hubId, userId });

  const memberCount = await hubRepo.countMembers(hubId);
  if (memberCount >= FOUNDER_THRESHOLD) {
    await activateHub(hubId);
    return { joined: true, activated: true };
  }

  return { joined: true, activated: false, memberCount };
}

// Maneja el ingreso de un vecino que llegó por link de invitación (ref_code).
// Resuelve el hub, valida su estado y deriva al flujo correspondiente.
async function joinByRefCode(userId, refCode) {
  const hub = await hubRepo.findByRefCode(refCode);

  if (!hub) {
    throw new Error("REF_CODE_NO_ENCONTRADO");
  }

  if (hub.status === "rejected" || hub.status === "archived") {
    const err = new Error("HUB_NO_DISPONIBLE");
    err.hub = hub;
    throw err;
  }

  if (hub.status === "pending") {
    return joinPendingHub(userId, hub.id);
  }

  // Hub activo: sumar directamente como vecino.
  const alreadyMember = await hubRepo.findMembership(userId, hub.id);
  if (alreadyMember) return { joined: false, activated: false, alreadyMember: true };

  await hubRepo.createMembership(userId, hub.id, "vecino", {});
  return { joined: true, activated: false, hub };
}

// Activa un hub pendiente. Uso interno (activación automática) y desde approveHub.
// Emite hub.activated con datos opcionales (ej: si fue manual, quién lo aprobó).
async function activateHub(hubId, extraEventData = {}) {
  const hub = await hubRepo.update(hubId, { status: "active" });
  eventBus.emit("hub.activated", { hubId, ...extraEventData });
  return hub;
}

// El admin aprueba manualmente un hub pendiente aunque no haya llegado a 5 interesados.
async function approveHub(hubId, adminUserId) {
  const hub = await hubRepo.findById(hubId);
  if (!hub) throw new Error("HUB_NO_ENCONTRADO");
  if (hub.status !== "pending") throw new Error("HUB_NO_ESTA_PENDIENTE");

  return activateHub(hubId, { approvedBy: adminUserId, manual: true });
}

// Suma un vecino a un hub activo. Idempotente: si ya es miembro, devuelve el membership existente.
async function joinActiveHub(userId, hubId) {
  const hub = await hubRepo.findById(hubId);
  if (!hub || hub.status !== "active") throw new Error("hub_not_active");

  const existing = await hubRepo.findMembership(userId, hubId);
  if (existing) return existing;

  const membership = await hubRepo.createMembership(userId, hubId, "vecino", {});
  eventBus.emit("hub.member_added", { hubId, userId, role: "vecino" });
  return membership;
}

// El admin rechaza un hub pendiente con un motivo.
// El motivo queda guardado en hub.settings para auditoría.
async function rejectHub(hubId, reason, adminUserId) {
  const hub = await hubRepo.findById(hubId);
  if (!hub) throw new Error("HUB_NO_ENCONTRADO");
  if (hub.status !== "pending") throw new Error("HUB_NO_ESTA_PENDIENTE");

  const updated = await hubRepo.update(hubId, {
    status: "rejected",
    settings: {
      ...(hub.settings || {}),
      rejectionReason: reason,
      rejectedBy: adminUserId,
    },
  });

  eventBus.emit("hub.rejected", { hubId, reason, adminUserId });
  return updated;
}

// El fundador edita el nombre o descripción de su hub vía bot.
// Solo puede editar quien tiene membership con metadata.founder = true.
// Escribe en audit_log antes de responder.
async function editHub(userId, hubId, { name, description }) {
  const membership = await hubRepo.findMembership(userId, hubId);
  if (!membership || !membership.metadata?.founder) {
    throw new Error("SIN_PERMISO_EDITAR");
  }

  // Guardamos el estado anterior para el audit log.
  const hubBefore = await hubRepo.findById(hubId);

  const changes = {};
  if (name !== undefined)        changes.name        = name;
  if (description !== undefined) changes.description = description;

  const updated = await hubRepo.update(hubId, changes);

  await prisma.auditLog.create({
    data: {
      userId,
      hubId,
      action: "hub.edited",
      entityType: "hub",
      entityId: hubId,
      changes: {
        before: { name: hubBefore.name, description: hubBefore.description },
        after: changes,
      },
    },
  });

  return updated;
}

module.exports = {
  findHubsForLocation,
  foundHub,
  joinActiveHub,
  joinPendingHub,
  joinByRefCode,
  activateHub,
  approveHub,
  rejectHub,
  editHub,
};
