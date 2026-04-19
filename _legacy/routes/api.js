// src/routes/api.js
const express = require("express");
const router  = express.Router();
const prov    = require("../controllers/proveedorController");
const prod    = require("../controllers/productoController");
const ped     = require("../controllers/pedidoController");
const caja    = require("../controllers/cajaController");

// Proveedores
router.get ("/proveedores",          prov.listar);
router.post("/proveedores",          prov.crear);
router.get ("/proveedores/:id",      prov.detalle);

// Productos
router.get ("/proveedores/:id/productos",    prod.listar);
router.post("/proveedores/:id/productos",    prod.crear);
router.put ("/productos/:prodId",            prod.actualizar);
router.post("/productos/:prodId/descuentos", prod.setDescuentos);

// Pedidos
router.get ("/proveedores/:id/pedidos",     ped.listar);
router.put ("/pedidos/:pedId/estado",       ped.cambiarEstado);

// Caja
router.get ("/proveedores/:id/caja",        caja.movimientos);
router.post("/proveedores/:id/caja",        caja.agregarMov);

module.exports = router;
