Este archivo es un changelog de las decisiones importantes de producto, arquitectura y código. No se borra lo viejo: se agrega lo nuevo arriba.

**Por qué existe este archivo:** cuando alguien (vos mismo dentro de 6 meses, un dev nuevo, un Claude Code en otra sesión) pregunte "¿por qué se hizo así?", la respuesta está acá con fecha y razón. Evita re-discutir decisiones ya tomadas.

---

## 2026-04-20 — Mensajes de error del flow engine bypassean el adaptador

**Contexto:** Si el flow engine lanza una excepción, el webhook debe mandar un mensaje genérico de error al usuario. Ese mensaje podría pasar por el adaptador `adaptMessage()` que convierte formato inglés a español.

**Decisión:** El mensaje de error se construye directamente en formato `wpService` (`{ tipo: "texto", texto: "..." }`), sin pasar por `adaptMessage`.

**Razón:** Si el adaptador tiene un bug, el mensaje de error igual llega al usuario. El camino de error tiene que ser lo más corto y simple posible.

**Implementación:** `src/routes/webhook.js`, paso 9 del pipeline y función `sendErrorMessage`.

---

## 2026-04-20 — Adaptador flow → wpService inline en el webhook

**Contexto:** Los flows devuelven mensajes en formato inglés (`{ type, text, buttons[{ id, title }] }`). `wpService` espera formato español (`{ tipo, texto, botones[{ id, label }] }`). Hay tres diferencias: `type → tipo`, `text → texto`, `title → label`.

**Decisión:** Función helper privada `adaptMessage()` dentro de `src/routes/webhook.js`. No es un módulo separado.

**Razón:** YAGNI. Solo el webhook la usa hoy. Si en PR 4 un worker también necesita convertir mensajes al enviar notificaciones, se extrae a `src/infrastructure/message.adapter.js` en ese momento. Extraer antes sería optimizar para un caso hipotético.

---

## 2026-04-20 — Procesamiento asíncrono con setImmediate hasta PR 4

**Contexto:** Meta exige una respuesta HTTP en menos de 20 segundos o reintenta el webhook. El procesamiento (queries a DB, llamadas a Meta API) puede tomar varios segundos.

**Alternativas evaluadas:**
- (a) Procesamiento síncrono bloqueante — arriesga timeouts de Meta si DB o wpService son lentos.
- (b) Enqueue en BullMQ — la solución correcta, pero requiere Redis (PR 4).
- (c) `setImmediate` — posterga el procesamiento al siguiente tick del event loop, liberando la respuesta.

**Decisión:** (c) `setImmediate`. El webhook responde 200 inmediatamente y el procesamiento real ocurre después.

**Tradeoff aceptado:** si el procesamiento falla después de haber respondido 200, Meta no lo sabe y no reintenta. El usuario no recibe respuesta. En PR 4 esto se resuelve correctamente con la cola: si el job falla, BullMQ puede reintentar con backoff exponencial.

**Implementación:** `src/routes/webhook.js`, handler del POST.

---

## 2026-04-20 — Idempotencia por INSERT atómico con constraint de DB

**Contexto:** Meta puede reintentar el mismo webhook varias veces. Si el bot procesa el mismo mensaje dos veces, el usuario recibe respuestas duplicadas y el estado de la conversación puede corromperse.

**Alternativas evaluadas:**
- (a) `findUnique` al principio, `INSERT` al final — tiene una ventana de race condition: dos requests paralelos del mismo `wamid` pueden pasar el check simultáneamente antes de que alguno haga el INSERT.
- (b) `INSERT` al principio del pipeline con `metaMessageId @unique` como lock — el constraint de PostgreSQL es atómico. Solo un INSERT puede ganar; el segundo lanza `P2002`.

**Decisión:** (b). El INSERT ocurre en el Paso 4, después de resolver usuario y conversación (necesarios para tener `conversationId`, que es non-nullable en la tabla `messages`). Si el INSERT lanza `P2002` → ya procesado, salir. Cualquier otro error de DB → loguear y salir conservadoramente.

**Limitación pendiente:** si `metaMessageId` viene vacío en el payload (edge case con payloads malformados), Postgres permite múltiples NULL en campos `@unique`, rompiendo la idempotencia. Fix aplicado: se descarta el mensaje antes del INSERT si `metaMessageId` está vacío.

**Implementación:** `src/routes/webhook.js`, Paso 4 del pipeline.

---

## 2026-04-20 — REF_CODE_REGEX con longitud mínima de 6 caracteres

**Contexto:** Los refCodes se generan como `hub_` + 8 chars base62 (`[0-9A-Za-z]`). El detector usa una regex para encontrar el patrón en el texto libre del mensaje.

**Decisión:** `/\bhub_[A-Za-z0-9]{6,}\b/`. Mínimo de 6 caracteres alfanuméricos después de `hub_`. Sin máximo fijo.

**Razón:** Un mínimo de 6 reduce falsos positivos con strings cortos como `hub_ok` que un usuario podría escribir en un mensaje normal. Sin máximo fijo se tolera un cambio futuro de longitud del código generado sin tener que tocar el detector.

**Implementación:** `src/infrastructure/ref-code.detector.js`.

---

## 2026-04-19 — Modelo de 3 estados de usuario

**Contexto:** La spec original asumía que un vecino solo podía operar si estaba en un hub activo. Si no había hub cerca, quedaba "afuera".

**Decisión:** Un vecino puede estar en uno de tres estados:
1. **Individual** — sin hub, puede comprar/contratar individualmente (sin beneficios grupales).
2. **Miembro de hub activo** — accede a descuentos por cantidad, servicios compartidos, etc.
3. **Interesado en hub pendiente** — opera como individual mientras espera que el hub se active.

**Razón:** No perder usuarios cuando no hay masa crítica todavía. Cada usuario individual es potencial fundador futuro y es data geográfica.

**Implementación:** El estado NO se almacena; se deriva en tiempo real desde las memberships. Centralizado en `userService.getCurrentState(userId)`.

---

## 2026-04-19 — Umbral de activación: 2 interesados

**Contexto:** La spec original exigía 5 interesados para activar un hub pendiente.

**Decisión:** Bajar a 2.

**Razón:** En etapa temprana, 5 es inalcanzable en muchas zonas. Con 2 ya hay comunidad mínima y el hub puede empezar a operar. Subir el umbral más adelante cuando haya tracción.

**Implementación:** Constante `FOUNDER_THRESHOLD = 2` en `hub.service.js`, exportada para que los textos del bot la usen sin hardcodear.

---

## 2026-04-19 — Invitación al fundador: link + código corto

**Contexto:** Originalmente íbamos a entregar solo un link wa.me al fundador.

**Decisión:** Entregar AMBOS:
- Link wa.me para compartir digital (frictionless para vecinos que confían).
- Código corto (`refCode`, ej: `hub_ABC12345`) para boca a boca.

**Razón:** Muchos vecinos desconfían de links sueltos por WhatsApp (miedo a estafas). El código les permite escribirlo ellos mismos, ganando credibilidad. Cubrimos ambos perfiles.

---

## 2026-04-19 — Descripción del hub: obligatoria, mínimo 10 caracteres

**Contexto:** Discusión sobre si la descripción del hub al fundar debía ser opcional o obligatoria.

**Decisión:** Obligatoria, mínimo 10 caracteres después de trim.

**Razón:** 10 caracteres son un mínimo bajo pero suficiente para que el fundador explique algo. "Hub del barrio" pasa. Evita hubs sin contexto. La fricción es mínima.

---

## 2026-04-19 — Ubicación de usuario individual: en user.metadata (JSONB)

**Contexto:** Para notificar a individuales cuando aparezca un hub cerca, necesitamos guardar su ubicación.

**Decisión:** Guardar en `user.metadata.lastKnownLocation` como objeto `{ lat, lng, capturedAt, source }`.

**Razón:** JSONB ya existe en la tabla, no requiere migración, y es suficiente para el volumen actual. Cuando haya miles de usuarios, migrar a columnas propias con índice geoespacial GIST. Principio: hacer lo más simple que pueda funcionar.

---

## 2026-04-19 — `findNearbyIndividuals` implementado como stub

**Contexto:** La función que busca individuales cercanos a un hub para notificarlos.

**Decisión:** Stub que devuelve array vacío, con TODO que indica implementarla cuando el worker de notificaciones (PR 4) la necesite.

**Razón:** No existe ningún consumidor de esa función todavía. Implementarla ahora sin saber el uso real sería sobre-ingeniería. Cuando llegue el momento, se decide entre filtrado JS simple o query con JSONB operators.

---

## 2026-04-19 — Errores de negocio vs excepciones de sistema

**Contexto:** Al manejar resultados de operaciones como `foundHub`, `setDisplayName`, etc.

**Decisión:**
- **Errores de negocio esperados** (ej: `YA_TIENE_HUB_PENDIENTE`, `name_too_short`) → se lanzan como `Error` con mensaje machine-readable. El caller hace `try/catch` y decide qué responder al usuario.
- **Excepciones reales del sistema** (DB caída, bug de programación) → burbujean hasta el webhook handler global que las loguea y responde con mensaje genérico.

**Razón:** Mezclar ambas cosas lleva a un infierno de try/catch y código difícil de seguir. Separación clara mejora la legibilidad y el debugging.

---

## 2026-04-19 — Tono del bot: formal, de usted

**Contexto:** Decisión de branding/voz del producto.

**Decisión:** Todos los mensajes del bot usan "usted", "su", "le", "desea", etc. Nunca "vos", "tu", "te".

**Razón:** Genera seriedad y confianza. HubYa maneja pedidos y eventualmente pagos. El tono formal reduce la percepción de "app informal" y aumenta la confianza del vecino en compartir su ubicación y datos.

---

## 2026-04-19 — El flow engine no envía mensajes, solo los devuelve

**Contexto:** Diseño del motor de flujos (`flow.engine.js`).

**Decisión:** El motor recibe el estado de la conversación y devuelve un `StepResult` con `messages`. **No llama a la API de Meta.** El webhook handler es quien toma los mensajes y los envía por WhatsApp.

**Razón:** Permite testear flows sin necesitar credenciales de Meta. Separa el "qué quiere decir el bot" (flow) del "cómo se envía" (canal). Si mañana agregamos Telegram o SMS, los flows no cambian.

---

## 2026-04-19 — Patrón repo / service / flow

**Contexto:** Arquitectura del backend.

**Decisión:** Tres capas estrictas:
- **Repository:** única capa que toca Prisma/DB. Funciones tontas que reciben datos y los escriben o leen.
- **Service:** lógica de negocio. Valida, normaliza, mergea. Llama al repo.
- **Flow:** orquestación de conversación. Llama al service. Nunca toca repo.

**Razón:** Separación de responsabilidades. Facilita testing (podés mockear el repo y testear el service). Facilita cambios (si migras de Prisma a otro ORM, solo cambia el repo).

**Regla derivada:** Si el service no agrega validación/lógica sobre el repo, algo está mal (posible anti-patrón "pasa-manos").

---

## 2026-04-19 — Evitar funciones "update genéricas" en services

**Contexto:** Primera tentación fue agregar `updateUser(id, data)` al user.service.

**Decisión:** Rechazado. En su lugar, funciones específicas por operación de negocio:
- `setDisplayName(userId, name)` — con validación y normalización.
- `updateLastLocation(userId, lat, lng)` — con validación de coordenadas.
- Etc.

**Razón:** `update(id, data)` genérico es un pasa-manos sin valor agregado. Cada operación de negocio merece su propia función con su propia lógica de validación.

---

## 2026-04-18 — Schema de DB con UUIDs, soft-delete, JSONB

**Contexto:** Diseño inicial del schema.

**Decisión:**
- Todas las tablas con UUID como primary key (no auto-increment).
- Soft-delete con campo `deletedAt` (nunca borrar registros realmente).
- Campos flexibles en JSONB (`metadata`, `settings`).
- Timestamps con timezone.

**Razón:** Multi-tenancy, auditoría, flexibilidad. Está documentado en `docs/ARCHITECTURE.md`.

---

## 2026-04-18 — Commits chicos, uno por cada unidad lógica

**Contexto:** Estrategia de trabajo en git.

**Decisión:** Cada PR se divide en sub-pasos (3c.2.a, 3c.2.b, etc.) donde cada sub-paso es un commit independiente. Mensaje de commit descriptivo en español, prefijo `feat(prXXX):` o `chore:` o `docs:`.

**Razón:** Si algo sale mal, se puede revertir un commit chico. Code review es más fácil. El historial cuenta la historia del proyecto.

---

## Formato para agregar decisiones nuevas

Al tomar una decisión importante, agregar al tope del archivo (arriba de todas las anteriores) con este formato:

```markdown
## YYYY-MM-DD — [Título corto de la decisión]

**Contexto:** Qué problema se estaba resolviendo.

**Decisión:** Qué se decidió hacer.

**Razón:** Por qué se eligió esta opción sobre las alternativas.

**Implementación (opcional):** Dónde vive en el código.
```
