# Estado actual del proyecto HubYa

Este documento se actualiza al final de cada sesión de trabajo.
Al iniciar la próxima sesión, leélo para saber exactamente dónde estamos.

**Última actualización:** 2026-04-20 (noche)
**Último commit:** docs: agregar SPECs del flujo del vecino y modelo de proveedores
**Branch:** main (siempre trabajamos en main por ahora)

---

## En qué PR estamos

**Próximo PR a definir** — Tenemos 2 caminos posibles para arrancar.
Ver sección "Próximo paso inmediato" más abajo.

### PR 3c.3 — COMPLETO

Sub-pasos del PR 3c.3:

- [x] 3c.3.a — meta.normalizer.js: normaliza el payload de Meta. Commit a84516e.
- [x] 3c.3.b — ref-code.detector.js: detecta hub_XXXXXX. Commit 50fa610.
- [x] 3c.3.c — webhook conectado al flow engine con idempotencia, firma HMAC, refCode, onboarding y adaptador. Commit be1ca92.
- [x] 3c.3.d — Documentación actualizada. Commit b2644de.

---

## NUEVOS SPECS — Visión de producto definida 2026-04-20

En la sesión del 20/04 se probó el bot por primera vez en WhatsApp real
y eso disparó decisiones importantes de producto. Quedaron documentadas
en 2 specs nuevos:

### docs/specs/SPEC-flujo-vecino-completo.md
- Pregunta inicial: vecino o proveedor.
- Onboarding de vecino simplificado.
- Menú post-unión al hub (servicios / compras / vecinos).
- Encuesta mensual de calificación (no por operación).

### docs/specs/SPEC-modelo-proveedores.md
- Onboarding del proveedor.
- Cupos por rubro: 2 productos / 5 servicios.
- Cobro a proveedores (suscripción mensual a HubYa).
- Sistema de baja por mala calificación (HubYa decide).
- Filosofía: mayorista directo + curaduría con datos.

Estos specs definen el modelo de negocio real. El bot actual (PR 3c.3)
es la base técnica; los specs son lo que viene a construir arriba.

---

## Próximo paso inmediato — Hay 2 caminos posibles

### Camino A — Seguir con PR 4 (técnico)
PR 4 — Workers + Redis + BullMQ + notificaciones asíncronas.

Qué incluye:
- Agregar Redis como addon en Railway.
- Instalar BullMQ y crear la cola notifications.
- Reemplazar el setImmediate del webhook por enqueue real.
- Worker de notificaciones a individuales cercanos.
- Implementar findNearbyIndividuals (hoy es stub).

Pro: sigue la roadmap original, base sólida para todo lo demás.
Contra: no agrega nada visible para el usuario todavía.

### Camino B — Empezar con SPEC-flujo-vecino-completo
PR — Split inicial vecino/proveedor.

Qué incluye:
- Pregunta al primer mensaje: "¿Sos vecino o proveedor?"
- Branch "vecino" → onboarding actual.
- Branch "proveedor" → "Próximamente disponible" (placeholder).

Pro: mejora visible inmediata para usuarios reales.
Contra: posterga la infraestructura de notificaciones.

Decisión pendiente para próxima sesión: elegir A o B según prioridad
de Gastón (¿más usuarios reales o más infraestructura?).

---

## Lo que ya funciona end-to-end

- Webhook recibe mensajes de Meta y responde 200 inmediatamente.
- Verificación de firma HMAC-SHA256 con META_APP_SECRET.
- Idempotencia: mismo wamid nunca se procesa dos veces.
- Normalización de payloads: texto, ubicación, botones, listas.
- Detección de hub_XXXXXX y adhesión al hub antes del flow engine.
- Resolución y creación de usuario por número de teléfono.
- Resolución de conversación con reset por inactividad (60 min).
- Onboarding automático para usuarios sin flow activo.
- Flow engine: onboarding, share_location, found_hub, join_pending_or_found.
- Respuestas enviadas por wpService (texto, botones, listas).
- Historial de mensajes inbound/outbound guardado en DB.

---

## Testing end-to-end desde WhatsApp real

Probado el 2026-04-20. El bot responde a mensajes en WhatsApp real.
Se detectaron áreas a mejorar (visión de producto, no bugs):
- Falta el split inicial vecino/proveedor.
- Falta el menú post-unión al hub.
- Falta el listado de proveedores asociados al hub.

Estas mejoras están documentadas en los 2 nuevos specs.

---

## Estado del Codespace

Cuando retomás:

1. Abrí el Codespace en github.com/codespaces.
2. Corré git pull para sincronizar.
3. Leé este archivo (docs/STATE.md).
4. Leé los 2 specs nuevos en docs/specs/.
5. Decidí Camino A o B.
6. Corré claude en la terminal y arrancá.

---

## Variables de entorno en Railway

- DATABASE_URL — URL de PostgreSQL.
- META_ACCESS_TOKEN — System User Token permanente.
- META_API_VERSION — versión actual de la API de WhatsApp.
- META_PHONE_NUMBER_ID — ID del número.
- META_PHONE_NUMBER — pendiente agregar, para armar links wa.me.
- META_WABA_ID — WhatsApp Business Account ID.
- META_WEBHOOK_VERIFY_TOKEN — token del webhook.
- META_APP_SECRET — para verificar firma HMAC. Pendiente agregar.

---

## Contactos y info del proyecto

- Dueño: Gastón Lambois (lamboisgaston@gmail.com, Salta, Argentina).
- Repo: github.com/lamboisgaston/hubya-backend.
- Hosting: Railway.
- Stack activo: Node.js + Express + PostgreSQL + Prisma + Meta WhatsApp Cloud API.
- Stack pendiente: Redis, BullMQ, Mercado Pago.
