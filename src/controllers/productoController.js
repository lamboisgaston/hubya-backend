// src/controllers/productoController.js
const db = require("../services/dbService");

exports.listar = async (req, res) => {
  try {
    const lista = await db.getProductos(parseInt(req.params.id));
    res.json(lista);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.crear = async (req, res) => {
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const p = await prisma.producto.create({ data: { ...req.body, proveedorId: parseInt(req.params.id) } });
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.actualizar = async (req, res) => {
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const p = await prisma.producto.update({ where: { id: parseInt(req.params.prodId) }, data: req.body });
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.setDescuentos = async (req, res) => {
  try {
    await db.setDescuentos(parseInt(req.params.prodId), req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
