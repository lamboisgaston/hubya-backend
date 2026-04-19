# Estado actual del proyecto HubYa

Este documento se actualiza al final de cada sesión de trabajo. Al iniciar la próxima sesión, leélo para saber exactamente dónde estamos.

---

**Última actualización:** 2026-04-19 (noche)
**Último commit:** `de67c65` — feat(pr3c2e): join-pending-or-found flow con 3 ramas según buttonId
**Branch:** `main` (siempre trabajamos en main por ahora)

---

## En qué PR estamos

**PR 3c.3** — Conectar el webhook al flow engine.

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

**PR 3c.3** — Conectar el webhook (`src/index.js`) al flow engine.

Contexto necesario:
- El webhook actual no usa el motor de flows aún; sigue con el código legacy.
- Hay que refactorizarlo para: (a) recibir mensajes de Meta, (b) normalizarlos al formato que espera el flow engine (`{ type, text, lat, lng, buttonId }`), (c) resolver usuario y conversación con los services, (d) llamar a `flow.engine.handle()`, (e) tomar los mensajes devueltos y enviarlos con `wpService`.
- Además: detectar `ref_code` en mensajes entrantes y llamar a `hubService.joinByRefCode` ANTES de entrar al flow engine.
- Este es el PR más delicado porque conecta WhatsApp con los flows. Hacerlo con paciencia, plan en prosa primero, commit chico.

---

## Lo que ya funciona conceptualmente (no probado end-to-end)

- Schema de DB completo con hubs, users, memberships, conversations, etc.
- Seed con datos de prueba (hub activo Palermo Soho, hub pendiente Salta Capital Centro, usuarios de prueba).
- Módulo de hubs (repo + service) con findHubsForLocation, foundHub, joinActiveHub, joinPendingHub, joinByRefCode, activateHub, approveHub, rejectHub, editHub.
- Módulo de usuarios (repo + service) con findOrCreateByPhone, setDisplayName, findById, getCurrentState, updateLastLocation, markAsIndividual, findNearbyIndividuals (stub).
- Módulo de conversaciones (repo + service) con getOrStartConversation, setFlow, setStep, completeConversation, resetIfExpired.
- Motor de flows genérico (`flow.engine.js`) con register + handle + _applyTransition.
- Flow onboarding (pide nombre, lo guarda, salta a share_location).
- Flow share-location (4 ramas + step await_no_hub_choice para la rama C).
- Flow de fundar hub (`found-hub.flow.js`): nombre, descripción mínimo 10 chars, link wa.me + código refCode, manejo de errores `YA_TIENE_HUB_PENDIENTE` y `HUB_CERCANO_EXISTENTE`.
- Flow de decisión post-hub-pendiente (`join-pending-or-found.flow.js`): 3 ramas según buttonId (join_pending, found_own, operate_solo) + fallback.

## Lo que falta para que el bot funcione end-to-end

| Pendiente | Qué es | PR |
|-----------|--------|----|
| Actualizar el webhook | src/index.js para que use el flow engine + detectar refCode en mensajes | 3c.3 |
| Workers + Redis + BullMQ | Notificaciones asíncronas + worker de individuales cercanos | PR 4 |
| Comandos de admin | /admin hubs pendientes, /admin aprobar, etc. | PR 5 |

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
- `META_PHONE_NUMBER` — **pendiente agregar**, para armar links wa.me en 3c.2.d.
- `META_WABA_ID` — WhatsApp Business Account ID.
- `META_WEBHOOK_VERIFY_TOKEN` — token del webhook.

---

## Contactos y info del proyecto

- **Dueño:** Gastón Lambois (lamboisgaston@gmail.com, Salta, Argentina).
- **Repo:** github.com/lamboisgaston/hubya-backend.
- **Hosting:** Railway.
- **Stack activo:** Node.js + Express + PostgreSQL + Prisma + Meta WhatsApp Cloud API.
- **Stack pendiente:** Redis, BullMQ, Mercado Pago.
