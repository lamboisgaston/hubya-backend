# Estado actual del proyecto HubYa

Este documento se actualiza al final de cada sesión de trabajo. Al iniciar la próxima sesión, leélo para saber exactamente dónde estamos.

---

**Última actualización:** 2026-04-19 (tarde)
**Último commit:** `f1ba82a` — feat(pr3c2c): opción operar como individual + refactor Rama C con step await_no_hub_choice
**Branch:** `main` (siempre trabajamos en main por ahora)

---

## En qué PR estamos

**PR 3c.2** — Flows de fundar hub + sumarse a pendiente + operar como individual.

Sub-pasos del PR 3c.2:

- [x] **3c.2.a** — Umbral a 2 + constante centralizada en textos. Commit `7e5c0c2`.
- [x] **3c.2.b** — Funciones nuevas en user.service: getCurrentState, updateLastLocation, markAsIndividual, findNearbyIndividuals (stub). Commit `6c149f1`.
- [x] **3c.2.c** — Rama "operar solo" en share-location + refactor Rama C con step await_no_hub_choice. Commit `f1ba82a`.
- [ ] **3c.2.d** — Crear src/flows/found-hub.flow.js. **← Próximo paso.**
- [ ] **3c.2.e** — Crear src/flows/join-pending-or-found.flow.js.
- [ ] **3c.2.f** — Posiblemente no necesario (el wire-up ya se hizo en 3c.2.c).

---

## Próximo paso inmediato

**PR 3c.2.d** — Crear `src/flows/found-hub.flow.js`.

Contexto necesario:
- Spec v2 sección 5.1 y 7.3.
- Steps: start → await_name → await_description.
- Nombre del hub mínimo 2 caracteres.
- Descripción obligatoria, mínimo 10 caracteres.
- Al crear exitoso: usar `hubService.foundHub(...)` y entregar al fundador link (wa.me) + código corto (refCode) con mensaje explicativo.
- Manejar errores conocidos: `YA_TIENE_HUB_PENDIENTE`, `HUB_CERCANO_EXISTENTE`.
- Tono formal, de usted, en todos los mensajes.
- Usar variable de entorno `META_PHONE_NUMBER` para armar el link (con placeholder si no está seteada).

---

## Lo que ya funciona conceptualmente (no probado end-to-end)

- Schema de DB completo con hubs, users, memberships, conversations, etc.
- Seed con datos de prueba (hub activo Palermo Soho, hub pendiente Salta Capital Centro, usuarios de prueba).
- Módulo de hubs (repo + service) con findHubsForLocation, foundHub, joinActiveHub, joinPendingHub, joinByRefCode, activateHub, approveHub, rejectHub, editHub.
- Módulo de usuarios (repo + service) con findOrCreateByPhone, setDisplayName, findById, getCurrentState, updateLastLocation, markAsIndividual, findNearbyIndividuals (stub).
- Módulo de conversaciones (repo + service) con getOrStartConversation, setFlow, setStep, completeConversation, resetIfExpired.
- Motor de flows genérico (`flow.engine.js`) con register + handle + _applyTransition.
- Flow onboarding (pide nombre, lo guarda, salta a share_location).
- Flow share-location (3 ramas + step await_no_hub_choice para la rama C).

## Lo que falta para que el bot funcione end-to-end

| Pendiente | Qué es | PR |
|-----------|--------|----|
| Flow de fundar hub | src/flows/found-hub.flow.js | 3c.2.d |
| Flow de sumarse / fundar / operar solo | src/flows/join-pending-or-found.flow.js | 3c.2.e |
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
