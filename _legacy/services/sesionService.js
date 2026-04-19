// src/services/sesionService.js
// Guarda y recupera el estado de cada conversación WP en la DB

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Obtener sesión existente o crear una nueva
exports.obtenerOCrear = async (telefono) => {
  let sesion = await prisma.sesion.findUnique({ where: { telefono } });

  if (!sesion) {
    // Detectar si es proveedor o vecino por el número registrado
    const proveedor = await prisma.proveedor.findUnique({ where: { telefono } });

    sesion = await prisma.sesion.create({
      data: {
        telefono,
        tipo:        proveedor ? "proveedor" : "vecino",
        proveedorId: proveedor?.id || null,
        step:        "start",
        ctx:         {},
      },
    });

    console.log(`🆕 Nueva sesión para ${telefono} — tipo: ${sesion.tipo}`);
  }

  return sesion;
};

// Guardar estado actualizado
exports.guardar = async (telefono, step, ctx) => {
  return prisma.sesion.update({
    where: { telefono },
    data:  { step, ctx },
  });
};

// Resetear sesión (para /reiniciar o timeout)
exports.resetear = async (telefono) => {
  return prisma.sesion.update({
    where: { telefono },
    data:  { step: "start", ctx: {} },
  });
};
