# CLAUDE.md — Contexto para Claude Code

> Este archivo es leído automáticamente por Claude Code al abrir el proyecto.
> Contiene las reglas, convenciones y contexto que Claude debe respetar siempre.

---

## Proyecto

**HubYa** es un marketplace local basado en WhatsApp que conecta vecinos con proveedores de productos y servicios dentro de "Hubs" (barrios, countries, edificios).

- **Dueño/Dev principal:** Gastón (solo, en aprendizaje)
- **Estado:** en desarrollo activo
- **Repo:** github.com/lamboisgaston/hubya-backend
- **Hosting:** Railway
- **Documento de arquitectura completa:** `docs/ARCHITECTURE.md` ← **LEELO ANTES DE PROPONER CAMBIOS IMPORTANTES**

---

## Stack

- **Runtime:** Node.js + Express
- **Base de datos:** PostgreSQL (con extensiones PostGIS, uuid-ossp, pg_trgm)
- **Cache / colas:** Redis + BullMQ (a incorporar)
- **Mensajería:** Meta WhatsApp Cloud API
- **Pagos:** Mercado Pago (a incorporar)
- **Hosting:** Railway (servicios separados para API y workers)

---

## Principios de arquitectura (no negociables)

1. **Multi-tenancy por Hub:** toda query que acceda a datos de negocio DEBE filtrar por `hub_id`. Nunca asumir un único hub.
2. **Bot stateless:** el estado de las conversaciones vive en la tabla `conversations`, nunca en memoria del proceso.
3. **Tareas lentas van a la cola:** envíos de WhatsApp, pagos, emails, notificaciones nunca se ejecutan sincrónicamente dentro de un webhook.
4. **Event-driven:** cuando pasa algo importante (pedido creado, pago aprobado), se emite un evento. Los consumidores son independientes.
5. **Idempotencia:** toda operación que pueda reintentarse (webhooks de Meta, de MP) debe ser idempotente usando IDs únicos del proveedor.

---

## Convenciones de base de datos

- **Primary keys:** UUID v4, nunca enteros autoincrementales.
- **Timestamps:** toda tabla tiene `created_at` y `updated_at` con `TIMESTAMPTZ`.
- **Soft deletes:** columna `deleted_at TIMESTAMPTZ`. Nunca `DELETE` físico salvo en tablas efímeras.
- **Datos flexibles:** usar columnas `JSONB` para configuración, metadata y payloads variables.
- **Snapshots:** los `order_items` guardan `name_snapshot` y `price_snapshot` del momento de la compra, no FKs a datos mutables.
- **Migraciones:** todo cambio de esquema va en un archivo de migración versionado en Git. Nunca editar la base a mano.
- **Índices:** revisar queries antes de mergear. Toda query frecuente debe tener un índice que la sostenga.

---

## Convenciones de código

- **Módulos por dominio**, no por tipo de archivo. Carpeta `modules/{dominio}/` con `repository`, `service`, `model`.
- **Repositorios** son la única capa que toca la base. Los services orquestan lógica de negocio.
- **Flows de WhatsApp** viven en `src/flows/`, no dentro del handler del webhook.
- **Nada de lógica pesada en el handler del webhook.** Responder 200 rápido, encolar el trabajo.
- **Errores loggeados siempre con contexto:** `user_id`, `hub_id`, `request_id`, `flow`, `step`.
- **Todas las funciones async con try/catch explícito** en los puntos de entrada (handlers, workers).

---

## Seguridad y secrets

- **Jamás hardcodear tokens, passwords, API keys.** Todo va por `process.env.*`.
- **Nunca commitear `.env`.** Debe estar en `.gitignore`.
- **El token de Meta es un System User Token** (permanente), no un token de usuario.
- Variables de entorno esperadas:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `META_ACCESS_TOKEN` (System User Token, sin expiración)
  - `META_PHONE_NUMBER_ID`
  - `META_VERIFY_TOKEN` (para el webhook)
  - `META_APP_SECRET` (para validar firmas)
  - `MP_ACCESS_TOKEN`
  - `MP_WEBHOOK_SECRET`
  - `NODE_ENV`
  - `LOG_LEVEL`

---

## Flujo de trabajo esperado

Cuando te pida agregar una funcionalidad, seguí este orden:

1. **Consultar `docs/ARCHITECTURE.md`** para ver si la feature ya está contemplada.
2. **Identificar en qué módulo vive** (users, orders, payments, rounds, etc.).
3. **Proponer los cambios de esquema** si hacen falta (como migración, nunca en vivo).
4. **Implementar repository → service → flow/handler** en ese orden.
5. **Agregar los eventos que correspondan** al event bus.
6. **Encolar las tareas lentas**, no ejecutarlas sincrónicamente.
7. **Loggear con contexto.**
8. **Si es crítico (pagos, rondas, roles): proponer tests.**

---

## Cosas que NO hacer

- ❌ Agregar librerías pesadas sin justificarlo.
- ❌ Mezclar código del panel web con el bot en el mismo servicio.
- ❌ Guardar archivos en el filesystem del servidor (Railway los borra). Usar storage externo.
- ❌ Responder webhooks de Meta con lógica sincrónica lenta.
- ❌ Hacer queries sin filtro de `hub_id` cuando aplica.
- ❌ Romper compatibilidad de APIs existentes sin avisar.
- ❌ Asumir el timezone. Siempre `TIMESTAMPTZ` en base, conversión en frontend.
- ❌ Usar `SELECT *` en producción.

---

## Estado actual del proyecto (actualizar a medida que avance)

- [x] Bot básico corriendo en Railway con Meta Cloud API
- [x] Flujo de conversación inicial en `flowService.js` (pendiente refactor al motor de flows)
- [x] Arquitectura documentada en `docs/ARCHITECTURE.md`
- [ ] Token permanente de Meta (System User Token) — **URGENTE**
- [ ] Esquema de base de datos aplicado vía migraciones
- [ ] Seed de datos de prueba
- [ ] Redis + BullMQ
- [ ] Worker separado en Railway
- [ ] Flujo de términos y condiciones
- [ ] Geolocalización de hubs
- [ ] Integración Mercado Pago
- [ ] Sistema de notificaciones
- [ ] Rondas colectivas
- [ ] Panel web de métricas

---

## Cómo hablarle a Gastón

- Es desarrollador en aprendizaje y trabaja solo. **Explicá el "por qué" de cada decisión técnica**, no solo el "cómo".
- Cuando propongas algo, si hay términos técnicos nuevos, definilos brevemente en contexto.
- Preferí soluciones simples que funcionen hoy a soluciones "perfectas" que lo traben.
- Nunca asumas que entiende un concepto por jerga. Si dudás, explicá.
- Ante decisiones con trade-offs, presentá las opciones con pros y contras antes de recomendar.
