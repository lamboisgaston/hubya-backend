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

module.exports = {
  findOrCreateByPhone,
  normalizeToE164,
};
