// src/controllers/pedidoController.js
const db = require("../services/dbService");

exports.listar = async (req, res) => {
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const lista = await prisma.pedido.findMany({
      where: { proveedorId: parseInt(req.params.id) },
      include: { cliente: true, items: { include: { producto: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(lista);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.cambiarEstado = async (req, res) => {
  try {
    const p = await db.cambiarEstadoPedido(parseInt(req.params.pedId), req.body.estado);
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
