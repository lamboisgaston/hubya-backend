const userRepository = require("./user.repository");

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

module.exports = {
  findOrCreateByPhone,
  normalizeToE164,
  setDisplayName,
};
