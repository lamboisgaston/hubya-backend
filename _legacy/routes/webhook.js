// src/routes/webhook.js
const express  = require("express");
const router   = express.Router();
const handler  = require("../controllers/webhookController");

// 360dialog llama GET para verificar el webhook al configurarlo
router.get("/whatsapp", handler.verify);

// 360dialog llama POST por cada mensaje entrante
router.post("/whatsapp", handler.receive);

module.exports = router;
