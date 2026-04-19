# SPEC — Feature: Hubs Fundadores

**Estado:** Draft v2
**Autor:** Gastón
**Fecha:** Abril 2026
**Para:** Claude Code
**Referencias:** `CLAUDE.md`, `docs/ARCHITECTURE.md`

---

## Changelog v2 (respecto a v1)

Cambios significativos respecto al draft anterior:

- **NUEVO:** Modelo de 3 estados del usuario (individual / interesado en pendiente / miembro activo). Cualquier vecino puede operar con HubYa desde el día uno, tenga o no hub cerca.
- **CAMBIO:** El umbral de activación pasa de 5 a **2 interesados** (acelerar activación en etapa temprana).
- **CAMBIO:** La descripción del hub al fundar es **obligatoria con mínimo 10 caracteres** (antes era opcional).
- **NUEVO:** Al fundador se le entrega **link + código corto** (antes solo link).
- **NUEVO:** La ubicación del vecino individual se guarda en `user.metadata.lastKnownLocation` para notificarlo cuando aparezca un hub cerca.
- **NUEVO:** Sistema de notificaciones proactivas: cuando aparece un hub, el bot avisa a los individuales de la zona.

---

## 1. Contexto

HubYa es un marketplace local basado en WhatsApp que conecta vecinos con proveedores dentro de "Hubs" (barrios, countries, edificios).

Hoy, cuando un vecino manda su ubicación al bot y no hay hubs activos en su zona, el bot le dice "no hay hubs cerca" y lo deja en un callejón sin salida. Ese vecino se pierde para siempre.

Esta spec resuelve ese problema con **dos mecanismos complementarios**:

1. **Cualquier vecino puede operar desde el día uno**, aunque no haya hub cerca. Entra como **usuario individual**. Puede comprar productos y contratar servicios, pero sin los beneficios grupales del hub (descuentos por cantidad, servicios compartidos, rondas colectivas).

2. **El vecino sin hub cerca puede convertirse en Fundador** de un hub nuevo. Invita a otros vecinos por link o código, y el hub se activa cuando llega a un mínimo de interesados (o cuando el admin lo aprueba manualmente).

Esto habilita crecimiento viral barrio por barrio, sin perder control de calidad ni perder usuarios que no pueden o no quieren fundar.

---

## 2. Objetivos de la feature

1. **Ningún vecino queda sin poder operar.** El bot siempre ofrece una vía de valor concreta.
2. La información de demanda geográfica se captura desde el día uno (para decidir dónde crecer, a quién notificar cuando hay nuevo hub).
3. El admin (Gastón) mantiene control sobre qué hubs se activan y cuáles no.
4. El Fundador tiene reconocimiento simbólico y capacidades mínimas de edición, sin ser admin.
5. La invitación a vecinos combina **link frictionless** + **código corto** para boca a boca.

---

## 3. Modelo de 3 Estados del Usuario

### 3.1. Los tres estados

Un vecino siempre está en exactamente uno de estos tres estados:

#### Estado 1: Individual

**Quién:** vecino que no está en ningún hub.

**Cómo llega a este estado:**
- No había hubs cerca y eligió "operar solo".
- Había hub pendiente y eligió "operar solo" en vez de sumarse.
- Eligió "no por ahora" cuando le ofrecieron fundar.

**Qué puede hacer:**
- Comprar productos individualmente.
- Contratar servicios individualmente.
- Recibir novedades generales del bot.
- Recibir aviso cuando aparezca un hub activo o pendiente en su zona.

**Qué NO puede hacer:**
- Acceder a descuentos por cantidad (rondas grupales).
- Usar servicios compartidos del hub (seguridad, limpieza, etc.).
- Votar o dar feedback en decisiones de hub.

#### Estado 2: Miembro de hub activo

**Quién:** vecino con `membership.active = true` en un hub con `status = 'active'`.

**Qué puede hacer:** todo lo del Estado 1 **+** los beneficios grupales.

#### Estado 3: Interesado en hub pendiente

**Quién:** vecino con `membership.active = true` en un hub con `status = 'pending'`. Puede tener además `membership.metadata.interested_in_pending = true`.

**Qué puede hacer:** igual que el Estado 1 (individual). Cuando el hub se active, **pasa automáticamente al Estado 2**.

### 3.2. Principio: el estado se deriva, no se almacena

**Importante:** el "estado del usuario" **no es un campo explícito en la tabla `users`**. Se deriva de sus memberships:

```
if (tiene membership activa en hub con status='active') → Estado 2
else if (tiene membership activa en hub con status='pending') → Estado 3
else → Estado 1
```

Esto mantiene la fuente de verdad única y evita inconsistencias. El service de usuarios va a exponer `userService.getCurrentState(userId)` que hace este cálculo.

### 3.3. Transiciones entre estados

| De | A | Cómo ocurre |
|----|---|-------------|
| 1 (Individual) | 2 (Miembro activo) | El vecino se suma a un hub activo que apareció cerca |
| 1 (Individual) | 3 (Interesado pendiente) | El vecino se suma a un hub pendiente |
| 1 (Individual) | 2 (Miembro activo) | El vecino funda un hub y el hub se activa por él solo (caso admin aprobó manualmente) |
| 3 (Interesado pendiente) | 2 (Miembro activo) | **Automática**: el hub pendiente llega al umbral y se activa |
| 2 (Miembro activo) | 1 (Individual) | El vecino deja voluntariamente el hub (feature futura, no en este PR) |

### 3.4. Captura de ubicación para usuarios individuales

Cuando un vecino comparte su ubicación y termina en Estado 1 (individual), **guardamos su ubicación** en:

```
user.metadata.lastKnownLocation = {
  lat: number,
  lng: number,
  capturedAt: ISO8601 timestamp,
  source: "share_location_flow" | "manual_address" | ...
}
```

**Por qué:** cuando aparezca un hub pendiente o activo en su zona, el worker de notificaciones va a buscar a todos los individuales cercanos y les mandará un aviso ofreciéndoles sumarse.

**Nota técnica:** por simplicidad y velocidad de iteración, guardamos en JSONB. En una futura iteración (cuando haya volumen), se migrará a columnas propias con índice geoespacial.

### 3.5. Notificaciones proactivas a individuales

Cuando se crea un hub pendiente o se activa un hub, el sistema:

1. Busca a todos los usuarios **individuales** (sin membership activa) cuya `lastKnownLocation` esté dentro de 1500 metros del hub.
2. Les encola un mensaje en la cola de notificaciones:
   - *"Buenos días. Le avisamos que en su zona se ha formado el hub '<nombre>'. Si desea sumarse como interesado, responda con el código <refCode>."*
3. Si el usuario responde con el código, entra al Estado 3 automáticamente.

**Detalle de producto:** para que el usuario pueda **optar por no recibir estas notificaciones**, agregamos `user.metadata.notificationsEnabled` (default: `true`). Si lo pone en `false`, no lo contactamos.

---

## 4. Estados del Hub

Sin cambios respecto a v1:

- `active` — hub operativo, acepta pedidos.
- `pending` — hub fundado pero aún no activo. No acepta pedidos grupales. Puede recibir interesados.
- `rejected` — hub que el admin decidió no activar.
- `archived` — hub dado de baja.

---

## 5. Reglas de negocio

### 5.1. Creación de un hub pendiente

Cuando un vecino manda su ubicación y **no hay ningún hub** (activo ni pendiente) en un radio de **1500 metros**:

- El bot le ofrece **tres opciones**:
  1. **"Sí, deseo fundarlo"** — inicia el flow de fundar hub.
  2. **"Operar como individual"** — pasa al Estado 1, guarda su ubicación.
  3. **"No por ahora"** — no se guarda nada, el usuario puede volver luego.

- Si elige fundar:
  - El bot pide nombre del hub (mínimo 2 caracteres).
  - El bot pide descripción (**obligatoria, mínimo 10 caracteres**).
  - Se crea un registro en `hubs` con:
    - `status = 'pending'`
    - `location` = la ubicación del vecino
    - `radius_meters = 1000` (default)
    - `created_by_user_id = <id del fundador>`
    - `ref_code` = generado al momento, formato `hub_` + 6 caracteres base62 aleatorios
  - Se crea un registro en `memberships` para el fundador con:
    - `role = 'vecino'`
    - `metadata.founder = true`
  - El bot le manda al fundador:
    1. Confirmación del hub creado.
    2. El **código corto** (`refCode`).
    3. El **link de invitación** (wa.me).
    4. Explicación de cómo usar link y código.
    5. Le avisa que el hub se activa al llegar a **2 interesados** (ver sección 5.5).

### 5.2. Hub pendiente cercano

Cuando un vecino manda su ubicación y **no hay hub activo** cerca pero **sí hay un hub pendiente** en un radio de **1500 metros**:

- El bot le muestra el hub pendiente: nombre del hub, fundador, cantidad actual de interesados.
- Le ofrece **tres opciones**:
  1. **"Sumarme como interesado"** — pasa al Estado 3.
  2. **"Fundar mi propio hub"** — inicia el flow de fundar (si el solapamiento de 500m lo permite).
  3. **"Operar como individual"** — pasa al Estado 1, guarda su ubicación.

- Si se suma como interesado:
  - Se crea un `membership` con `role = 'vecino'`, `metadata.interested_in_pending = true`.
  - Si ya hay el umbral de interesados → el hub se activa automáticamente (ver 5.5).

### 5.3. Hub activo cercano

Cuando un vecino manda su ubicación y **sí hay un hub activo** en radio:

- El bot le muestra el hub y lo suma automáticamente como vecino (comportamiento actual, sin cambios).
- Transición: pasa directo al Estado 2.
- Alternativamente, el bot le puede ofrecer **"Operar como individual"** en vez de sumarse, aunque el default y recomendado es sumar al hub activo directamente.

### 5.4. Link de invitación del Fundador

**Formato del link:**

```
https://wa.me/<numero_del_bot>?text=Quiero%20sumarme%20a%20un%20hub%20<ref_code>
```

- `<numero_del_bot>` viene de `process.env.META_PHONE_NUMBER`.
- `<ref_code>` es el código corto único del hub.

**Código corto independiente:**

El `ref_code` se entrega **también por separado** en el mensaje al fundador, en un formato legible (`hub_ABC123`). Esto permite que el fundador lo diga de boca en boca a vecinos que desconfíen de hacer click en links recibidos por WhatsApp.

**Texto del mensaje al fundador:**

```
✅ Su hub '<nombre>' fue creado.

🔑 Código para invitar vecinos: <refCode>

📲 Link para compartir por WhatsApp:
<link>

Explique a sus vecinos que pueden:
• Abrir el link y mandar el mensaje que se arma solo, o
• Escribirle al bot al número <numero> y mandar el código <refCode>.

Su hub se activará cuando <FOUNDER_THRESHOLD> vecinos se sumen como interesados.
```

**Procesamiento del mensaje entrante:**

Cuando un vecino envía un mensaje al bot que contiene `hub_XXXXXX` (o el formato del refCode):
- El bot extrae el código.
- Busca el hub correspondiente.
- Si existe y está `pending`: lo suma como interesado (3.3).
- Si existe y está `active`: lo suma como miembro al toque.
- Si no existe o está `rejected/archived`: mensaje de error amable.

> **No pedirle ubicación** cuando el vecino viene por link o código. La acción de usar el código implica intención.

### 5.5. Activación automática del hub

Un hub pasa de `pending` a `active` cuando:

- Llega a **`FOUNDER_THRESHOLD`** (actualmente **2**) memberships distintos con `active = true`, incluyendo al fundador.

La constante vive en `hub.service.js` como `FOUNDER_THRESHOLD = 2`. Está centralizada para que cambiarla sea un cambio en un solo lugar.

**Al activarse:**

1. Cambia `status = 'active'`.
2. Se emite un evento `hub.activated` al event bus.
3. Un worker de notificaciones manda un WhatsApp a **todos los miembros** del hub:
   - *"¡Su hub '<nombre>' ha sido activado! Desde ahora pueden hacer pedidos grupales, acceder a descuentos y servicios compartidos."*
4. Al fundador le llega un mensaje especial de reconocimiento:
   - *"🎉 Ha activado su hub. Gracias por ser Fundador. Sus vecinos ahora pueden comenzar a operar en comunidad."*
5. **NUEVO:** Se buscan usuarios individuales en la zona y se les encola aviso (ver 3.5).

### 5.6. Aprobación o rechazo manual por admin

Sin cambios respecto a v1. El admin puede:

- **Activar manualmente** un hub pendiente aunque no haya llegado al umbral.
- **Rechazar** un hub pendiente (pasa a `status = 'rejected'`).

Comandos del bot para usuarios con `role = 'super_admin'`:
- `/admin hubs pendientes` — lista hubs pendientes.
- `/admin aprobar <hub_id>` — activa manualmente.
- `/admin rechazar <hub_id> <motivo>` — rechaza con motivo.

### 5.7. Edición del hub por el Fundador

Sin cambios respecto a v1.

### 5.8. Restricciones

- Un usuario no puede fundar más de **1 hub pendiente** al mismo tiempo.
- Si dos vecinos intentan fundar un hub en zonas que se solapan (radio de 500m), el bot ofrece al segundo sumarse al hub del primero o pasar a individual.
- Un hub pendiente que no llega al umbral en **30 días** queda en `status = 'pending'` pero se marca `metadata.stale = true` para que el admin lo revise.
- **Unicidad de nombres:** el nombre del hub NO es único globalmente. Dos hubs "Palermo" en zonas distintas son válidos. La protección real contra duplicados es el solapamiento de 500m.

---

## 6. Cambios en la base de datos

### 6.1. Estado actual

El schema de Prisma ya fue modificado en PR 1 para incluir:
- `hubs.status` (active/pending/rejected/archived).
- `hubs.createdByUserId` (FK a users).
- `hubs.refCode` (VARCHAR UNIQUE).
- `hubs.settings` (JSONB para auditoría de rechazos).
- `users.metadata` (JSONB).
- `memberships.metadata` (JSONB).

### 6.2. Cambios nuevos (para v2)

**No requiere migración de DB.** El cambio del modelo de 3 estados usa los campos que ya existen:
- La ubicación del individual se guarda en `user.metadata.lastKnownLocation`.
- El flag de notificaciones opt-out va en `user.metadata.notificationsEnabled`.
- El status del usuario se deriva de las memberships existentes.

---

## 7. Flujos de conversación

### 7.1. Flow: onboarding.flow.js

Sin cambios conceptuales. Pide nombre y transiciona a `share_location`.

### 7.2. Flow: share-location.flow.js (ACTUALIZADO)

Recibe la ubicación del vecino y decide entre 4 ramas ahora (antes eran 3):

- **RAMA A** — Hay hub activo cerca → suma al vecino al hub. Transición a Estado 2. `done: true`.
- **RAMA B** — No hay activo, sí hay pendiente cerca → ofrece 3 opciones:
  - Sumarse como interesado → transición a Estado 3, salta a flow específico.
  - Fundar hub propio → transición a flow `found_hub`.
  - Operar como individual → guarda ubicación, transición a Estado 1, `done: true`.
- **RAMA C** — No hay nada cerca → ofrece 3 opciones:
  - Fundar hub → transición a flow `found_hub`.
  - Operar como individual → guarda ubicación, transición a Estado 1, `done: true`.
  - No por ahora → `done: true`, sin guardar ubicación.

### 7.3. Flow: found-hub.flow.js (NUEVO)

```
start:
  mensaje: "Perfecto. Vamos a fundar su hub. ¿Qué nombre desea ponerle?"
  nextStep: await_name

await_name:
  valida: al menos 2 caracteres.
  guarda: context.hub_name
  mensaje: "Excelente. Ahora escriba una descripción breve (mínimo 10 caracteres)."
  nextStep: await_description

await_description:
  valida: mínimo 10 caracteres después de trim.
  llama: hubService.foundHub({ userId, name, description, lat, lng })
  maneja errores conocidos:
    - YA_TIENE_HUB_PENDIENTE → mensaje amable
    - HUB_CERCANO_EXISTENTE → pedir volver a share_location
  si éxito: entrega link + código + explicación
  done: true
```

### 7.4. Flow: join-pending-or-found.flow.js (NUEVO)

Se activa desde rama B de share-location. Reacciona al `buttonId`:

```
start:
  según buttonId:
    "join_pending" → hubService.joinPendingHub → mensaje de confirmación → done: true
    "found_own"    → nextFlow: "found_hub", nextStep: "start", contextPatch: {lat, lng}
    "operate_solo" → userService.markAsIndividual(userId, lat, lng) → done: true
    otro           → mostrar botones de nuevo, se queda en start
```

### 7.5. Flow: handle-individual.flow.js (NUEVO)

Se activa cuando un usuario individual envía un mensaje. Muestra el menú de operaciones disponibles (comprar, contratar servicios, ver su estado, etc.).

**Nota:** este flow queda como esqueleto para esta feature. Las operaciones concretas de comprar y contratar vienen en features posteriores.

### 7.6. Handler: ref_code en webhook (NUEVO)

En el webhook, antes de entrar al flow engine, el handler detecta si el mensaje contiene un patrón de refCode (ej: regex `hub_[A-Za-z0-9]{6}`):

1. Extrae el refCode.
2. Llama a `hubService.joinByRefCode(userId, refCode)`.
3. Maneja los 3 casos:
   - Hub activo → lo suma como vecino, responde con confirmación.
   - Hub pendiente → lo suma como interesado, responde con estado actual.
   - Hub rechazado/archivado/inexistente → responde con disculpa.

---

## 8. Eventos nuevos (event bus)

Respecto a v1, se agrega:

- `user.became_individual` — cuando un vecino se marca como individual.
- `user.location_updated` — cuando un individual actualiza su ubicación.

**Consumidor:**
- `hub.created_pending` / `hub.activated` → worker que busca individuales cercanos y les encola aviso.

---

## 9. Servicios nuevos/modificados

### 9.1. user.service.js

**Nuevas funciones:**

- `getCurrentState(userId)` — devuelve `"individual" | "member_active" | "member_pending"`.
- `markAsIndividual(userId, lat, lng)` — actualiza `metadata.lastKnownLocation` y deja al usuario sin memberships.
- `updateLastLocation(userId, lat, lng)` — helper que guarda ubicación.
- `findNearbyIndividuals(lat, lng, radiusMeters)` — busca individuales cercanos a un punto (para notificaciones).

### 9.2. hub.service.js

Sin cambios nuevos para v2. Las funciones existentes (`foundHub`, `joinPendingHub`, `joinActiveHub`, `joinByRefCode`, `activateHub`) ya cubren todo lo necesario.

Solo se ajusta la constante `FOUNDER_THRESHOLD` de 5 a 2.

---

## 10. Notificaciones (via cola, nunca sincrónicas)

Encolar en la cola `notifications` (BullMQ):

- **Al fundador, al crear hub pendiente:** mensaje de bienvenida + link + código.
- **A los miembros, al activarse el hub:** mensaje de celebración.
- **Al fundador, al activarse su hub:** mensaje especial de reconocimiento.
- **A los individuales cercanos, al aparecer hub pendiente o activo:** oferta de sumarse.
- **Al admin, al crearse un hub pendiente:** resumen para revisión.

---

## 11. Casos borde a cubrir

1. Vecino manda ubicación sin permisos de GPS → mensaje claro, ofrecer ingresar dirección manualmente (fuera del alcance de esta spec, dejar un TODO).
2. Fundador elige un nombre ofensivo → el admin puede rechazar.
3. Vecino ya es miembro del hub pendiente y vuelve a mandar ubicación → idempotencia, mostrar estado actual.
4. Link con ref_code de un hub rechazado o archivado → mensaje de disculpas, ofrecer fundar uno nuevo.
5. Error en la generación del ref_code (colisión) → retry hasta 3 veces.
6. Vecino individual con ubicación guardada se mueve a otra zona y manda nueva ubicación → actualizar lastKnownLocation.
7. Usuario individual vuelve al bot y pide operar → siempre habilitado, muestra menú de individual.
8. **NUEVO:** Usuario individual recibe aviso de hub cerca y lo ignora → no insistir más de 3 veces por hub. Guardar en `metadata.notifiedHubs = [hubId, ...]`.

---

## 12. Tests requeridos

Prioridad **alta**:

- Crear hub pendiente cuando no hay hubs cerca.
- Usuario elige "operar solo" → queda como individual, su ubicación se guarda.
- Sumarse a hub pendiente existente.
- Activación automática al llegar a 2 interesados.
- Activación manual por admin.
- Rechazo por admin.
- Link con ref_code suma al usuario al hub correcto.
- Un usuario no puede fundar dos hubs pendientes al mismo tiempo.
- Transición automática: hub pendiente se activa, los interesados pasan a Estado 2.
- **NUEVO:** Individual con ubicación guardada recibe aviso cuando aparece hub cerca.

Prioridad **media**:

- Edición de nombre/descripción por el fundador.
- Hub pendiente con colisión de zonas (500m).
- Usuario individual deshabilita notificaciones, no recibe más avisos.

---

## 13. Qué NO está en esta spec (fuera de alcance)

- Panel web de administración (queda en el roadmap).
- Filtros automáticos de palabras inapropiadas en nombres.
- Compartir link por otros canales que no sean WhatsApp.
- Sistema de reputación del fundador.
- Expiración automática de hubs pendientes.
- Permitir que un vecino cambie de Estado 2 → Estado 1 (dejar hub voluntariamente).
- Operaciones concretas de compra y servicios (viene en features posteriores).

---

## 14. Orden de implementación (PRs)

Ajustado al progreso actual (actualizado al 2026-04-19):

- [x] **PR 1** — Schema + migración + seed. **COMPLETO.**
- [x] **PR 2** — Módulo de hubs (repository + service). **COMPLETO.**
- [x] **PR 3a** — Módulo de usuarios. **COMPLETO.**
- [x] **PR 3b** — Módulo de conversaciones. **COMPLETO.**
- [x] **PR 3c.1** — Motor de flows + onboarding + share-location (3 ramas). **COMPLETO.**
- [ ] **PR 3c.2** — Flow de fundar hub + flow de sumarse/fundar/individual + umbral a 2 + rama de "operar individual" en share-location + funciones `markAsIndividual` y `getCurrentState` en user.service.
- [ ] **PR 3c.3** — Webhook: conectar WhatsApp al flow engine + handler de ref_code + handler de menú individual.
- [ ] **PR 4** — Eventos + workers (incluye worker de notificaciones a individuales cercanos).
- [ ] **PR 5** — Comandos de admin (`/admin ...`).
- [ ] **PR 6** — Tests de prioridad alta.
- [ ] **PR 7+** — Mercado Pago, panel web, rondas colectivas, etc.

---

## 15. Checklist para Claude Code (al finalizar PR 3c.2)

- [ ] `FOUNDER_THRESHOLD = 2` en `hub.service.js` con comentario explicativo y exportado.
- [ ] `share-location.flow.js` actualizado con las 4 ramas (activo / pendiente+3opciones / nada+3opciones).
- [ ] Textos del bot usando la constante `FOUNDER_THRESHOLD` (no hardcoded).
- [ ] Flow `found-hub.flow.js` creado con 3 steps: start, await_name, await_description.
- [ ] Descripción del hub valida mínimo 10 caracteres.
- [ ] Mensaje de éxito al fundador incluye link + código + instrucciones.
- [ ] Flow `join-pending-or-found.flow.js` creado con branch por buttonId.
- [ ] Función `userService.markAsIndividual(userId, lat, lng)` creada.
- [ ] Función `userService.getCurrentState(userId)` creada.
- [ ] Todos los mensajes del bot usan tono formal y de usted.
- [ ] Cero imports de repositorios desde flows (solo services).
- [ ] Cero TODOs sin resolver en los archivos commiteados.
