const userRepository = require("./user.repository");
const hubRepository  = require("../hubs/hub.repository");

// WhatsApp envía números sin '+' y a veces con caracteres extra.
// Normalizamos a E.164: solo dígitos precedidos por '+'.
function normalizeToE164(rawPhone) {
  const digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) throw new Error(`Número de teléfono inválido: ${rawPhone}`);
  return `+${digits}`;
}

async function findOrCreateByPhone(rawPhone) {
  const phoneNumber = normalizeToE164(rawPhone);

  const existing = await userRepository.findByPhone(phoneNumber);
  if (existing) return existing;

  return userRepository.create({ phoneNumber });
}

async function setDisplayName(userId, name) {
  if (typeof name !== "string") throw new Error("name_invalid_type");

  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("name_too_short");

  const normalized = trimmed
    .substring(0, 100)
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  return userRepository.update(userId, { fullName: normalized });
}

async function findById(userId) {
  return userRepository.findById(userId);
}

// Devuelve el estado actual del usuario, derivado de sus memberships:
//   "member_active"  → miembro de hub activo (puede operar con beneficios grupales).
//   "member_pending" → interesado en hub pendiente (opera como individual mientras espera).
//   "individual"     → sin membership activa (opera como individual).
// El estado se deriva; nunca se almacena.
async function getCurrentState(userId) {
  const memberships = await hubRepository.findActiveMembershipsWithHub(userId);

  for (const m of memberships) {
    if (m.hub.status === "active") return "member_active";
  }
  for (const m of memberships) {
    if (m.hub.status === "pending") return "member_pending";
  }
  return "individual";
}

// Guarda la ubicación del usuario en metadata.lastKnownLocation con merge shallow.
// Lanza "location_invalid" si lat/lng no son numbers, "location_out_of_range" si están fuera de rango.
async function updateLastLocation(userId, lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new Error("location_invalid");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("location_out_of_range");
  }

  const user = await userRepository.findById(userId);
  const existing = user.metadata ?? {};

  return userRepository.update(userId, {
    metadata: {
      ...existing,
      lastKnownLocation: {
        lat,
        lng,
        capturedAt: new Date().toISOString(),
        source: "share_location_flow",
      },
    },
  });
}

// Marca al usuario como individual: guarda su ubicación y, si nunca configuró
// notificaciones, las habilita por defecto (sin pisar si el usuario las desactivó).
async function markAsIndividual(userId, lat, lng) {
  const user = await updateLastLocation(userId, lat, lng);

  if (user.metadata?.notificationsEnabled === undefined) {
    return userRepository.update(userId, {
      metadata: { ...user.metadata, notificationsEnabled: true },
    });
  }

  return user;
}

// TODO: implementar cuando el worker de notificaciones (PR 4) la necesite.
// Decidir entre filtrado JS simple (para pocos usuarios) o query con JSONB operators.
async function findNearbyIndividuals(lat, lng, radiusMeters) {
  return [];
}

module.exports = {
  findOrCreateByPhone,
  normalizeToE164,
  setDisplayName,
  findById,
  getCurrentState,
  updateLastLocation,
  markAsIndividual,
  findNearbyIndividuals,
};
