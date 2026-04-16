// src/controllers/proveedorController.js
const db = require("../services/dbService");

exports.listar = async (req, res) => {
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const lista = await prisma.proveedor.findMany();
    res.json(lista);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.crear = async (req, res) => {
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const p = await prisma.proveedor.create({ data: req.body });
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.detalle = async (req, res) => {
  try {
    const p = await db.getProveedor(parseInt(req.params.id));
    if (!p) return res.status(404).json({ error: "No encontrado" });
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
