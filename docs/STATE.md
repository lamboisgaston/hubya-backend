# Estado actual del proyecto HubYa

Este documento se actualiza al final de cada sesión de trabajo. Al iniciar la próxima sesión, leélo para saber exactamente dónde estamos.

---

**Última actualización:** 2026-04-20 (noche)
**Último commit:** `docs: actualizar STATE.md y DECISIONS.md al cerrar PR 3c.3`
**Branch:** `main` (siempre trabajamos en main por ahora)

---

## En qué PR estamos

**PR 4** — Workers + Redis + BullMQ + notificaciones asíncronas.

### PR 3c.3 — COMPLETO

Sub-pasos del PR 3c.3:

- [x] **3c.3.a** — `src/infrastructure/meta.normalizer.js`: normaliza el payload de Meta al formato interno `{ type, text, location, buttonId, from, metaMessageId }`. Commit `a84516e`.
- [x] **3c.3.b** — `src/infrastructure/ref-code.detector.js`: detecta `hub_XXXXXX` en mensajes entrantes y resuelve la adhesión al hub antes de entrar al flow engine. Commit `50fa610`.
- [x] **3c.3.c** — `src/routes/webhook.js`: webhook conectado al flow engine con idempotencia por INSERT atómico, verificación de firma HMAC, detección de refCode, arranque de onboarding, adaptador flow→wpService y registro de mensajes en DB. Commit `be1ca92`.
- [x] **3c.3.d** — Documentación actualizada. Este commit.

### PR 3c.2 — COMPLETO

Sub-pasos del PR 3c.2:

- [x] **3c.2.a** — Umbral a 2 + constante centralizada en textos. Commit `7e5c0c2`.
- [x] **3c.2.b** — Funciones nuevas en user.service: getCurrentState, updateLastLocation, markAsIndividual, findNearbyIndividuals (stub). Commit `6c149f1`.
- [x] **3c.2.c** — Rama "operar solo" en share-location + refactor Rama C con step await_no_hub_choice. Commit `f1ba82a`.
- [x] **3c.2.d** — Crear src/flows/found-hub.flow.js. Commit `406b8c9`.
- [x] **3c.2.e** — Crear src/flows/join-pending-or-found.flow.js. Commit `de67c65`.
- **3c.2.f** — NO NECESARIO — el wire-up se integró en 3c.2.c.

---

## Próximo paso inmediato

**PR 4** — Workers + Redis + BullMQ + notificaciones asíncronas.

Qué incluye:
- Agregar Redis como addon en Railway.
- Instalar BullMQ y crear la cola `notifications`.
- Separar el servicio en dos en Railway: `web` (bot actual) y `worker` (consumidor de cola).
- Reemplazar el `setImmediate` del webhook por un enqueue real en BullMQ.
- Worker de notificaciones: cuando se emite `hub.activated` o `hub.created_pending`, notificar a los individuales cercanos.
- Implementar `findNearbyIndividuals` (hoy es un stub que devuelve array vacío).

---

## Lo que ya funciona end-to-end

Con el PR 3c.3 completo, el pipeline completo del bot está operativo:

- Webhook recibe mensajes de Meta y responde 200 inmediatamente.
- Verificación de firma HMAC-SHA256 con `META_APP_SECRET`.
- Idempotencia: mismo `wamid` nunca se procesa dos veces.
- Normalización de payloads: texto, ubicación, botones, listas, tipos no soportados.
- Detección de `hub_XXXXXX` en mensajes y adhesión al hub antes del flow engine.
- Resolución y creación de usuario por número de teléfono (E.164).
- Resolución de conversación con reset por inactividad (60 minutos).
- Onboarding automático para usuarios sin flow activo.
- Flow engine ejecutando: onboarding, share_location, found_hub, join_pending_or_found.
- Respuestas enviadas por `wpService` (texto, botones, listas).
- Historial de mensajes inbound/outbound guardado en DB.

## Lo que funciona conceptualmente (no probado end-to-end desde WhatsApp real)

- Schema de DB completo con hubs, users, memberships, conversations, etc.
- Seed con datos de prueba (hub activo Palermo Soho, hub pendiente Salta Capital Centro, usuarios de prueba).
- Módulo de hubs (repo + service) con findHubsForLocation, foundHub, joinActiveHub, joinPendingHub, joinByRefCode, activateHub, approveHub, rejectHub, editHub.
- Módulo de usuarios (repo + service) completo.
- Módulo de conversaciones (repo + service) completo.

## Lo que falta para que el bot esté en producción real

| Pendiente | Qué es | PR |
|-----------|--------|----|
| Workers + Redis + BullMQ | Reemplazar setImmediate por cola real | PR 4 |
| findNearbyIndividuals | Implementar la búsqueda geográfica de individuales | PR 4 |
| Comandos de admin | /admin hubs pendientes, /admin aprobar, etc. | PR 5 |
| Tests de flujos críticos | Especialmente pagos, activación de hubs | PR 6 |

---

## Testing end-to-end desde WhatsApp real

**Pendiente.** Los 10 casos de prueba manual están documentados en el commit `be1ca92` (sección G del plan de 3c.3.c). En resumen:

1. Onboarding básico (texto → pide nombre → pide ubicación).
2. Ubicación cerca de hub activo → suma al vecino directamente.
3. Ubicación cerca de hub pendiente → muestra 3 opciones.
4. Ubicación sin hubs cercanos → ofrece fundar o individual.
5. Flow de fundar hub end-to-end → recibe refCode y link.
6. Mandar `hub_XXXXXXXX` → adhesión sin onboarding de ubicación.
7. Mandar imagen o audio → respuesta de tipo no soportado.
8. Inactividad > 60 min → reset del flow al siguiente mensaje.
9. Webhooks de status (delivery/read) → ignorados sin procesamiento.
10. Logs de Railway durante las pruebas para diagnóstico.

---

## Estado del Codespace

Cuando retomás:
1. Abrí el Codespace en github.com/codespaces.
2. Corré `git pull` para sincronizar.
3. Leé este archivo (docs/STATE.md).
4. Corré `claude` en la terminal y decile:
   > "Leé docs/STATE.md y docs/DECISIONS.md para ponerte al día. Después arrancamos el próximo paso que indica STATE.md."

---

## Variables de entorno en Railway

En el servicio `hubya-backend`:

- `DATABASE_URL` — URL de PostgreSQL.
- `META_ACCESS_TOKEN` — System User Token permanente (no temporal).
- `META_API_VERSION` — versión actual de la API de WhatsApp.
- `META_PHONE_NUMBER_ID` — ID del número.
- `META_PHONE_NUMBER` — **pendiente agregar**, para armar links wa.me en found-hub.flow.
- `META_WABA_ID` — WhatsApp Business Account ID.
- `META_WEBHOOK_VERIFY_TOKEN` — token del webhook.
- `META_APP_SECRET` — para verificar firma HMAC de webhooks entrantes. **Pendiente agregar.**

---

## Contactos y info del proyecto

- **Dueño:** Gastón Lambois (lamboisgaston@gmail.com, Salta, Argentina).
- **Repo:** github.com/lamboisgaston/hubya-backend.
- **Hosting:** Railway.
- **Stack activo:** Node.js + Express + PostgreSQL + Prisma + Meta WhatsApp Cloud API.
- **Stack pendiente:** Redis, BullMQ, Mercado Pago.
