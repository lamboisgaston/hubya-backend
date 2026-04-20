const router = require("express").Router();

// Placeholder para rutas de API futuras (panel web, admin, etc.).
router.get("/health", (_req, res) => res.json({ ok: true }));

module.exports = router;
