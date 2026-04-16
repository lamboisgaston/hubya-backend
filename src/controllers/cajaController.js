// src/controllers/cajaController.js
const db = require("../services/dbService");

exports.movimientos = async (req, res) => {
  try {
    const movs = await db.getMovCaja(parseInt(req.params.id));
    res.json(movs);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.agregarMov = async (req, res) => {
  try {
    const mov = await db.agregarMovCaja(parseInt(req.params.id), req.body);
    res.json(mov);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
