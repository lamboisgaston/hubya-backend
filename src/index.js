// src/index.js
require("dotenv").config();
const express = require("express");
const app = express();

app.use(express.json());

// ── Rutas ──────────────────────────────────────────────
app.use("/webhook",  require("./routes/webhook"));
app.use("/api",      require("./routes/api"));

// ── Health check ───────────────────────────────────────
app.get("/", (req, res) => res.json({ ok: true, app: "HubYa Backend", version: "1.0.0" }));

// ── Arrancar ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ HubYa backend corriendo en puerto ${PORT}`);
  console.log(`📱 Webhook WP: POST /webhook/whatsapp`);
});
