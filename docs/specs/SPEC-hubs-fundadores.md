# SPEC — Feature: Hubs Fundadores

**Estado:** Draft v1
**Autor:** Gastón
**Fecha:** Abril 2026
**Para:** Claude Code
**Referencias:** `CLAUDE.md`, `docs/ARCHITECTURE.md`

---

## 1. Contexto

Hoy, cuando un vecino manda su ubicación al bot y no hay hubs activos en su zona, el bot le dice "no hay hubs cerca" y lo deja en un callejón sin salida. Ese vecino se pierde para siempre.

Esta spec resuelve ese problema convirtiendo al vecino sin hub en un **Fundador**: un vecino que inicia un hub en estado "pendiente", invita a otros vecinos con un link, y el hub se activa cuando junta un mínimo de interesados (o cuando el admin lo aprueba manualmente).

Esto habilita crecimiento viral barrio por barrio, sin perder control de calidad.

---

## 2. Objetivos de la feature

1. Ningún vecino que muestre interés puede quedar sin respuesta útil.
2. La información de demanda geográfica se captura desde el día uno (para decidir dónde crecer).
3. El admin (Gastón) mantiene control sobre qué hubs se activan y cuáles no.
4. El Fundador tiene reconocimiento simbólico y capacidades mínimas de edición, sin ser admin.
5. La invitación a vecinos es frictionless: un link que se comparte por WhatsApp.

---

## 3. Reglas de negocio

### 3.1. Estados del Hub

Extender el enum de estado de la tabla `hubs` con:

- `active` — hub operativo, acepta pedidos (estado actual, ya existe).
- `pending` — hub fundado pero aún no activo. No acepta pedidos. Puede recibir interesados.
- `rejected` — hub que el admin decidió no activar (por nombre inapropiado, zona inválida, etc.).
- `archived` — hub dado de baja.

> Implementar como columna `status` con `CHECK` o `ENUM` de Postgres. Respetar la convención de `ARCHITECTURE.md`.

### 3.2. Creación de un hub pendiente

Cuando un vecino manda su ubicación y **no hay ningún hub** (activo ni pendiente) en un radio de **1500 metros**:

- El bot le ofrece ser **Fundador** de un hub nuevo.
- Si acepta, el bot le pregunta:
  1. Nombre del hub (ej: "Palermo Soho", "Barrio La Horqueta").
  2. Breve descripción opcional (una línea).
- Se crea un registro en `hubs` con:
  - `status = 'pending'`
  - `location` = la ubicación del vecino
  - `radius_meters = 1000` (default del `ARCHITECTURE.md`)
  - `created_by_user_id = <id del fundador>` (agregar esta FK a la tabla `hubs`)
- Se crea un registro en `memberships` para el fundador con:
  - `role = 'vecino'`
  - `metadata.founder = true` (la medallita de Fundador vive en el JSONB de `metadata`)
- El bot le manda al fundador:
  1. Un mensaje de bienvenida explicando que el hub está pendiente.
  2. El **link de invitación** (ver sección 3.5).
  3. Le avisa que el hub se activa al llegar a **5 interesados** (o cuando el admin lo apruebe manualmente, lo que pase primero).

### 3.3. Hub pendiente cercano

Cuando un vecino manda su ubicación y **no hay hub activo** cerca pero **sí hay un hub pendiente** en un radio de **1500 metros**:

- El bot le muestra el hub pendiente: nombre, fundador, cantidad de interesados actuales.
- Le ofrece **"Sumarme como interesado"** o **"Crear mi propio hub"**.
- Si se suma como interesado:
  - Se crea un `membership` con `role = 'vecino'`, `metadata.interested_in_pending = true`.
  - Si ya hay 5 interesados en total → el hub se activa automáticamente (ver 3.6).

### 3.4. Comportamiento cuando ya hay hub activo

Sin cambios. Comportamiento actual: se le sugiere unirse al hub existente.

### 3.5. Link de invitación del Fundador

Formato:
```
https://wa.me/<numero_del_bot>?text=Hola%20quiero%20sumarme%20al%20Hub%20<nombre_url_encoded>%20ref%3A<ref_code>
```

Donde:
- `<numero_del_bot>` viene de `process.env.META_PHONE_NUMBER_ID` o del número que corresponda (revisar cómo está configurado hoy).
- `<nombre_url_encoded>` es el nombre del hub url-encoded.
- `<ref_code>` es un código corto único por hub, generado al momento de crear el hub pendiente. Formato sugerido: `hub_` + 8 caracteres base62 aleatorios. Guardar en `hubs.ref_code` (nueva columna, UNIQUE).

Cuando un vecino envía un mensaje al bot que contiene `ref:hub_xxxxxxxx`:
- El bot extrae el `ref_code` del mensaje.
- Busca el hub correspondiente.
- Si existe y está `pending`: lo suma como interesado (3.3).
- Si existe y está `active`: lo suma como miembro al toque.
- Si no existe o está `rejected/archived`: mensaje de error amable.

> **No pedirle ubicación** cuando el vecino viene por link. El link ya implica intención.

### 3.6. Activación automática del hub

Un hub pasa de `pending` a `active` cuando:

- Llega a **5 memberships** distintos (incluyendo al fundador).

**Al activarse:**
1. Cambia `status = 'active'`.
2. Se emite un evento `hub.activated` (al event bus del `ARCHITECTURE.md`).
3. Un worker de notificaciones (cola `notifications`) manda un WhatsApp a **todos los miembros** del hub: *"¡Hub <nombre> activado! Ya podés empezar a pedir y ofrecer servicios."*
4. Al fundador le llega un mensaje especial: *"🎉 Lograste activar tu Hub. Gracias por ser Fundador."*

### 3.7. Aprobación o rechazo manual por admin

El admin (super_admin o Gastón) puede:

- **Activar manualmente** un hub pendiente aunque no haya llegado a 5 interesados.
- **Rechazar** un hub pendiente (pasa a `status = 'rejected'`).

Para esta spec, alcanza con exponer estas acciones como **comandos del bot** para usuarios con `role = 'super_admin'`:
- `/admin hubs pendientes` — lista hubs pendientes.
- `/admin aprobar <hub_id>` — activa manualmente.
- `/admin rechazar <hub_id> <motivo>` — rechaza con motivo.

El panel web queda fuera del alcance de esta spec (va en el roadmap).

### 3.8. Edición del hub por el Fundador

El fundador (vecino con `memberships.metadata.founder = true`) puede editar vía bot:
- Nombre del hub
- Descripción

Comandos del bot:
- `/hub editar nombre <nuevo_nombre>`
- `/hub editar descripcion <nueva_descripcion>`

Toda edición queda en `audit_log`.

### 3.9. Restricciones

- Un usuario no puede fundar más de **1 hub pendiente** al mismo tiempo. Si ya tiene uno pendiente y quiere fundar otro, el bot lo bloquea con un mensaje amable.
- Si dos vecinos intentan fundar un hub en zonas que se solapan (radio de 500m), el bot ofrece al segundo sumarse al hub del primero.
- Un hub pendiente que no llega a los 5 interesados en **30 días** queda en `status = 'pending'` pero se marca `metadata.stale = true` para que el admin lo revise.

---

## 4. Cambios en la base de datos

### 4.1. Migración nueva

Nombre sugerido: `20260418_hubs_fundadores.sql`

```sql
-- Extender estados del hub
ALTER TABLE hubs
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'pending', 'rejected', 'archived'));

-- Quién fundó el hub
ALTER TABLE hubs
    ADD COLUMN created_by_user_id UUID REFERENCES users(id);

-- Código corto para invitación
ALTER TABLE hubs
    ADD COLUMN ref_code VARCHAR(20) UNIQUE;

-- Índice para búsquedas por estado (muy frecuente)
CREATE INDEX idx_hubs_status_location ON hubs(status)
    WHERE deleted_at IS NULL;

-- Índice geoespacial ya existe por ARCHITECTURE.md, pero confirmar que filtra por status
```

### 4.2. Convenciones

- Respetar todas las reglas del `CLAUDE.md`: UUIDs, soft delete, timestamps, multi-tenancy.
- El `ref_code` se genera con una función de JS confiable (ej: `nanoid` con alfabeto base62 de 8 caracteres).
- Migraciones con Prisma (ya está configurado en el proyecto, usar `prisma migrate dev --name hubs_fundadores`).

---

## 5. Flujos de conversación a modificar

### 5.1. Flujo actual: "enviar ubicación"

Buscar en `src/` (probablemente `flowService.js` o un módulo de flows) el punto donde se maneja la ubicación del vecino. Modificar para que consulte los hubs **activos Y pendientes** en la zona, no solo activos.

### 5.2. Nuevo subflujo: "fundar hub"

Crear un flow dedicado (respetando la convención del `ARCHITECTURE.md` de tener flows en `src/flows/`):

```
fundar_hub.flow.js
    step 1: confirmar intención ("¿Querés fundar el primer hub de tu zona?")
    step 2: pedir nombre del hub
    step 3: pedir descripción (opcional, con "saltar")
    step 4: crear el hub pendiente, el membership del fundador, y el ref_code
    step 5: mandar link de invitación y mensaje de bienvenida
```

Todo el estado del flow vive en la tabla `conversations` (Regla 1 del `ARCHITECTURE.md`: stateless).

### 5.3. Nuevo subflujo: "sumarse a hub pendiente"

```
sumarse_hub_pendiente.flow.js
    step 1: mostrar datos del hub pendiente
    step 2: preguntar "¿Te sumás?"
    step 3: crear membership, chequear si llega a 5 interesados
    step 4: si llega a 5 → activar hub (disparar evento hub.activated)
    step 5: confirmación al vecino
```

### 5.4. Nuevo handler: "mensaje con ref_code"

Cuando un mensaje entrante incluye `ref:hub_xxxxxxxx`, antes de entrar al flow estándar, el bot debe:
1. Extraer el ref_code.
2. Resolver el hub.
3. Manejar el alta según 3.5.

---

## 6. Eventos nuevos (event bus)

Agregar al event bus los siguientes eventos:

- `hub.created_pending` — cuando se funda un hub nuevo.
- `hub.interested_added` — cuando se suma un interesado.
- `hub.activated` — cuando pasa de pending a active.
- `hub.rejected` — cuando el admin lo rechaza.

**Consumidores:**
- `hub.activated` → worker de notificaciones masivas (mensaje a todos los miembros).
- `hub.interested_added` → worker que chequea si llegó al umbral de 5 y dispara `hub.activated`.
- Todos los eventos → `audit_log`.

---

## 7. Notificaciones (via cola, nunca sincrónicas)

Encolar en la cola `notifications` (BullMQ según `ARCHITECTURE.md`):

- **Al fundador, al crear hub pendiente:** mensaje de bienvenida + link.
- **A los miembros, al activarse el hub:** mensaje de celebración.
- **Al admin, al crearse un hub pendiente:** resumen para revisión.

---

## 8. Casos borde a cubrir

1. Vecino manda ubicación sin permisos de GPS activos → mensaje claro, ofrecer ingresar dirección manualmente (fuera del alcance de esta spec, dejar un TODO).
2. Fundador elige un nombre ofensivo/basura → el admin puede rechazar (3.7). Nota a futuro: sumar un filtro automático de palabras.
3. Vecino ya es miembro del hub pendiente y vuelve a mandar ubicación → el bot lo reconoce y le muestra el estado actual del hub, no lo suma de nuevo.
4. Link con ref_code de un hub rechazado o archivado → mensaje de disculpas, ofrecer fundar uno nuevo.
5. Error en la generación del ref_code (colisión) → retry hasta 3 veces, si falla loguear y responder al usuario con un error genérico.
6. Vecino manda ubicación dos veces seguidas → idempotencia, no crear duplicados.

---

## 9. Tests requeridos

Prioridad **alta** (implementar sí o sí):

- Crear hub pendiente cuando no hay hubs cerca.
- Sumarse a hub pendiente existente.
- Activación automática al llegar a 5 interesados.
- Activación manual por admin.
- Rechazo por admin.
- Link con ref_code suma al usuario al hub correcto.
- Un usuario no puede fundar dos hubs pendientes al mismo tiempo.

Prioridad **media**:

- Edición de nombre/descripción por el fundador.
- Hub pendiente con colisión de zonas (500m).

---

## 10. Qué NO está en esta spec (fuera de alcance)

- Panel web de administración (queda en el roadmap).
- Filtros automáticos de palabras inapropiadas en nombres.
- Compartir link por otros canales que no sean WhatsApp.
- Código corto manual (solo link).
- Sistema de reputación del fundador.
- Expiración automática de hubs pendientes (solo marcar como stale, no borrar).

---

## 11. Checklist para Claude Code

Antes de marcar esta feature como completa, verificar:

- [ ] Migración creada con Prisma y aplicada localmente.
- [ ] El esquema nuevo respeta todas las convenciones del `CLAUDE.md`.
- [ ] Flows nuevos en `src/flows/`, no dentro del webhook handler.
- [ ] Estado de conversación en la tabla `conversations` (stateless).
- [ ] Notificaciones encoladas, no sincrónicas.
- [ ] Eventos emitidos al event bus.
- [ ] Logging con contexto (`user_id`, `hub_id`, `flow`, `step`).
- [ ] Idempotencia en el alta por ref_code.
- [ ] Tests de los casos de prioridad alta pasando.
- [ ] Seed actualizado con al menos 1 hub `pending` y 1 usuario con `metadata.founder = true` para poder probar.
- [ ] Documentación breve de los nuevos comandos de admin en el `README.md`.

---

## 12. Orden sugerido de implementación

Si es una feature grande para hacer de un saque, Claude Code puede dividirla en PRs más chicos:

1. **PR 1 — Esquema:** migración + regenerar Prisma client + seed actualizado.
2. **PR 2 — Lógica de hubs:** repositorio y service para hubs con los nuevos estados y acciones.
3. **PR 3 — Flows de conversación:** fundar hub, sumarse a pendiente, handler de ref_code.
4. **PR 4 — Eventos y notificaciones:** event bus + workers.
5. **PR 5 — Comandos de admin:** los `/admin ...` del bot.
6. **PR 6 — Tests:** de prioridad alta.

Cada PR se puede revisar por separado, lo que facilita mi revisión como no-programador.
