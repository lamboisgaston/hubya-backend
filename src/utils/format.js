// src/utils/format.js

// Formatear pesos argentinos
exports.pesos = (n) =>
  "$ " + Math.abs(Math.round(n / 100)).toLocaleString("es-AR");
// Los montos se guardan en centavos en DB
// Si querés guardar en pesos enteros, cambiar a:
// exports.pesos = (n) => "$ " + Math.abs(Math.round(n)).toLocaleString("es-AR");

// Formatear fecha
exports.fecha = (d) => {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

// Negrita WP (markdown de WA)
exports.bold = (s) => `*${s}*`;

// Itálica WP
exports.italic = (s) => `_${s}_`;
