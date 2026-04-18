# HubYa — Arquitectura Escalable

**Para:** Gastón
**Fecha:** Abril 2026
**Objetivo:** diseñar HubYa desde el día uno para que pueda crecer de 10 usuarios a 10 millones sin reescribir todo.

---

## 0. Cómo leer este documento

- Si entendés poco, leelo de arriba a abajo. Cada sección explica el **qué** y el **por qué**.
- Las secciones con 🧠 son conceptos importantes que vas a usar siempre.
- Las secciones con 🔧 son cosas concretas para hacer.
- Las secciones con ⚠️ son errores comunes que te van a costar caro si no los evitás.

---

## 1. La mentalidad de escalabilidad 🧠

Mucha gente cree que "escalar" significa comprar un servidor más grande. Eso se llama **escalamiento vertical** y tiene un techo bajo: un día el servidor no entra en más.

Lo que vos necesitás es **escalamiento horizontal**: poder prender 10 bots, 100 bots, 1000 bots en paralelo, y que todos trabajen juntos sin pisarse.

Para que eso sea posible, tu código tiene que cumplir **tres reglas de oro**:

### Regla 1: El bot no recuerda nada por sí mismo (stateless)

> ❌ MAL: guardar en una variable de memoria "el usuario Juan está en el paso 3 del flujo de compra".
> ✅ BIEN: guardar eso en la base de datos.

**Por qué importa:** si el bot se reinicia (y se va a reiniciar, te lo garantizo), pierde todo lo que tenía en memoria. Con 10 usuarios no lo notás. Con 10.000 usuarios es una catástrofe. Además, si la memoria está en la base, podés correr 5 bots en paralelo atendiendo al mismo usuario.

### Regla 2: Todo lo lento va a una cola

> Mandar un WhatsApp, cobrar con Mercado Pago, enviar un email: **nunca** lo hagas "en vivo" dentro del request del usuario.

**Por qué importa:** si Mercado Pago tarda 4 segundos, el usuario espera 4 segundos mirando WhatsApp sin respuesta. Si lo encolás, el bot le contesta al toque "estoy procesando tu pago" y un *worker* separado hace el trabajo pesado. Cuando termina, le avisa.

### Regla 3: Separás los datos de cada Hub (multi-tenancy)

> Cada Hub (un barrio, un country, un edificio) es un mundo aparte.

**Por qué importa:** el día que un Hub de Mendoza tenga 100.000 transacciones y uno de Salta tenga 50, podés migrar el de Mendoza a su propio servidor **sin tocar el resto**. Si mezclás los datos, nunca más podés separarlos sin dolor.

---

## 2. Arquitectura general del sistema 🧠

Mirá este esquema mental. HubYa no es **un solo programa**. Son varias piezas que hablan entre sí:

```
┌─────────────────┐
│   WhatsApp      │  ← acá está el usuario (vecino, proveedor)
│   (Meta Cloud)  │
└────────┬────────┘
         │ webhooks
         ▼
┌─────────────────┐      ┌──────────────────┐
│  API / Bot      │─────▶│   Redis (cola)   │
│  (Node+Express) │      │   + caché        │
└────────┬────────┘      └────────┬─────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐      ┌──────────────────┐
│   PostgreSQL    │      │   Workers        │
│   (los datos)   │◀─────│  (procesan cola) │
└─────────────────┘      └──────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ Meta, Mercado    │
                         │ Pago, emails...  │
                         └──────────────────┘
```

### Las piezas, una por una:

**API/Bot (lo que ya tenés en Railway)**
Recibe los webhooks de WhatsApp, decide qué responder, y responde. Nada más. Si algo es lento, no lo hace: lo encola.

**PostgreSQL (tu base de datos)**
El único lugar donde vive la verdad. Usuarios, Hubs, pedidos, conversaciones, todo.

**Redis (lo que te falta agregar)**
Dos funciones:
1. **Caché**: guardar datos que se leen muy seguido para no pegarle a Postgres todo el tiempo.
2. **Cola de trabajos** (con BullMQ): acá se encolan las tareas lentas.

**Workers (lo que te falta agregar)**
Procesos separados del bot que sacan tareas de la cola y las ejecutan. Mandan WhatsApps, procesan pagos, disparan notificaciones. Podés tener 1 worker o 100 workers según la carga.

**Panel web (a futuro)**
Una aplicación separada (Next.js por ejemplo) que también se conecta a PostgreSQL para mostrar métricas, administrar hubs, etc. **No mezclés el panel con el bot.** Son dos servicios distintos.

### ⚠️ Errores comunes que NO vas a cometer

1. **Poner lógica pesada adentro del handler del webhook.** Te van a llover timeouts de Meta.
2. **Guardar archivos en el disco del servidor.** Railway te los borra. Usá un S3/R2/Supabase Storage.
3. **Hardcodear el token de Meta en el código.** Va en variables de entorno. Siempre.
4. **Usar IDs autoincrementales (1, 2, 3...) como identificadores públicos.** Usá UUIDs.

---

## 3. Diseño de la base de datos 🔧

Esta es la parte más importante. Una base de datos mal diseñada es **imposible** de arreglar cuando ya tenés usuarios. Una bien diseñada te deja crecer sin límites.

### 3.1. Decisiones generales (aplican a todas las tablas)

- **Primary key: UUID**, no entero. Se generan en cualquier servidor sin chocar.
- **Todas las tablas tienen `created_at` y `updated_at`** (timestamps con timezone).
- **Borrado lógico (soft delete)**: una columna `deleted_at`. Nunca borrás de verdad. Podés recuperar y auditar.
- **Columnas `JSONB` para datos flexibles.** PostgreSQL los indexa y los consulta rapidísimo.
- **Foreign keys siempre declaradas.** Integridad a nivel base de datos, no a nivel código.
- **Extensiones a activar:** `uuid-ossp` (UUIDs), `postgis` (geolocalización), `pg_trgm` (búsquedas por texto).

### 3.2. Las tablas, en orden de dependencia

#### `hubs` — la raíz de todo

Cada Hub es un "inquilino". **Casi todas las queries del sistema van a filtrar por `hub_id`.**

```sql
CREATE TABLE hubs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) UNIQUE NOT NULL,        -- ej: "barrio-palermo-soho"
    name VARCHAR(200) NOT NULL,
    description TEXT,
    address TEXT,
    location GEOGRAPHY(POINT, 4326),          -- lat/lng con PostGIS
    radius_meters INTEGER DEFAULT 1000,       -- área de cobertura
    timezone VARCHAR(50) DEFAULT 'America/Argentina/Buenos_Aires',
    settings JSONB DEFAULT '{}'::jsonb,       -- configuración por hub
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_hubs_location ON hubs USING GIST(location);
CREATE INDEX idx_hubs_active ON hubs(active) WHERE deleted_at IS NULL;
```

**Por qué `settings` es JSONB:** hoy un Hub tiene configuración X, mañana le querés agregar "acepta pagos en efectivo: sí/no". Con JSONB lo agregás sin alterar la estructura.

#### `users` — la persona detrás del número de WhatsApp

Un usuario es **una persona**, no un rol. La misma persona puede ser vecino en un Hub y proveedor en otro.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,  -- formato E.164: +5491122334455
    full_name VARCHAR(200),
    email VARCHAR(200),
    preferred_language CHAR(2) DEFAULT 'es',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_users_phone ON users(phone_number) WHERE deleted_at IS NULL;
```

#### `memberships` — qué rol tiene cada usuario en cada Hub

Acá está la magia del multi-tenant. **Un usuario puede tener varios roles en varios hubs.**

```sql
CREATE TYPE membership_role AS ENUM (
    'vecino',
    'proveedor_producto',
    'proveedor_servicio',
    'admin_hub',
    'super_admin'
);

CREATE TABLE memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    hub_id UUID NOT NULL REFERENCES hubs(id),
    role membership_role NOT NULL,
    active BOOLEAN DEFAULT true,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, hub_id, role)
);

CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_memberships_hub_role ON memberships(hub_id, role) WHERE active = true;
```

**Por qué importa:** cuando el bot recibe un WhatsApp, busca al usuario por `phone_number`, ve sus `memberships` activas, y según el contexto sabe con qué "sombrero" le está hablando.

#### `terms_acceptances` — blindaje legal

```sql
CREATE TABLE terms_acceptances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    hub_id UUID REFERENCES hubs(id),            -- null = términos globales
    terms_version VARCHAR(20) NOT NULL,         -- ej: "2026-04-v1"
    accepted_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_ip INET,
    accepted_via VARCHAR(20),                   -- 'whatsapp' | 'web'
    metadata JSONB DEFAULT '{}'::jsonb           -- user_agent, device, etc.
);

CREATE INDEX idx_terms_user ON terms_acceptances(user_id);
CREATE INDEX idx_terms_version ON terms_acceptances(terms_version);
```

**Tip legal:** guardá el texto completo de cada versión de términos en otra tabla o en un archivo versionado. El día que alguien te demande, tenés que poder reproducir exactamente qué aceptó.

#### `categories` — productos y servicios

```sql
CREATE TYPE category_type AS ENUM ('product', 'service');

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hub_id UUID REFERENCES hubs(id),            -- null = categoría global
    type category_type NOT NULL,
    parent_id UUID REFERENCES categories(id),   -- para jerarquía
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    display_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_categories_hub_type ON categories(hub_id, type) WHERE active = true;
CREATE INDEX idx_categories_parent ON categories(parent_id);
```

#### `providers` — el perfil comercial de un usuario

Un `membership` de rol `proveedor_*` tiene un `provider` asociado con la info comercial.

```sql
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    membership_id UUID NOT NULL REFERENCES memberships(id),
    business_name VARCHAR(200) NOT NULL,
    description TEXT,
    logo_url TEXT,
    phone_business VARCHAR(20),                 -- puede diferir del personal
    verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    rating_avg DECIMAL(3,2),                    -- cache de reviews
    rating_count INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_providers_active ON providers(active) WHERE active = true;
```

#### `offerings` — productos o servicios que un proveedor ofrece

```sql
CREATE TYPE price_type AS ENUM ('fixed', 'per_hour', 'per_unit', 'per_project', 'on_request');

CREATE TABLE offerings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id),
    hub_id UUID NOT NULL REFERENCES hubs(id),   -- denormalizado para queries rápidas
    category_id UUID REFERENCES categories(id),
    type category_type NOT NULL,
    name VARCHAR(300) NOT NULL,
    description TEXT,
    price DECIMAL(12,2),
    price_type price_type DEFAULT 'fixed',
    currency CHAR(3) DEFAULT 'ARS',
    available BOOLEAN DEFAULT true,
    stock INTEGER,                              -- null = ilimitado (para servicios)
    images JSONB DEFAULT '[]'::jsonb,           -- array de URLs
    attributes JSONB DEFAULT '{}'::jsonb,       -- atributos flexibles
    search_vector tsvector,                     -- para búsqueda full-text
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_offerings_hub_category ON offerings(hub_id, category_id)
    WHERE available = true AND deleted_at IS NULL;
CREATE INDEX idx_offerings_provider ON offerings(provider_id);
CREATE INDEX idx_offerings_search ON offerings USING GIN(search_vector);
```

**Por qué `search_vector`:** para que cuando un vecino busque "pizza" en el bot, el resultado sea instantáneo aunque haya 500.000 productos.

#### `conversations` — el estado del flujo del bot (cumple la Regla 1)

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    hub_id UUID REFERENCES hubs(id),
    current_flow VARCHAR(100),                  -- 'onboarding', 'place_order', etc.
    current_step VARCHAR(100),                  -- el paso dentro del flow
    context JSONB DEFAULT '{}'::jsonb,          -- datos recolectados hasta ahora
    last_inbound_at TIMESTAMPTZ,
    last_outbound_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,                     -- si no hay actividad, se cierra
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conv_user ON conversations(user_id, hub_id);
CREATE INDEX idx_conv_expires ON conversations(expires_at) WHERE expires_at IS NOT NULL;
```

#### `messages` — historial completo de WhatsApps

Esta es la tabla que más va a crecer. **Pensala para particionar por mes** cuando tengas millones.

```sql
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE message_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    direction message_direction NOT NULL,
    meta_message_id VARCHAR(200) UNIQUE,        -- para idempotencia con Meta
    type VARCHAR(50),                           -- text, image, template, etc.
    content TEXT,
    payload JSONB,                              -- cuerpo completo del mensaje
    status message_status DEFAULT 'queued',
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Particiones mensuales (hacelo con un job automático):
CREATE TABLE messages_2026_04 PARTITION OF messages
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE INDEX idx_messages_conv_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_meta_id ON messages(meta_message_id);
```

**Idempotencia:** cuando Meta reintenta enviarte un webhook (y lo va a hacer), el `meta_message_id` único te garantiza que no procesás el mismo mensaje dos veces.

#### `orders` y `order_items`

```sql
CREATE TYPE order_status AS ENUM (
    'pending', 'confirmed', 'preparing', 'in_progress',
    'delivered', 'completed', 'cancelled', 'disputed'
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(20) UNIQUE NOT NULL,   -- human-readable: "HY-2026-001234"
    hub_id UUID NOT NULL REFERENCES hubs(id),
    buyer_user_id UUID NOT NULL REFERENCES users(id),
    provider_id UUID NOT NULL REFERENCES providers(id),
    status order_status DEFAULT 'pending',
    subtotal DECIMAL(12,2) NOT NULL,
    fee DECIMAL(12,2) DEFAULT 0,                -- comisión de HubYa
    total DECIMAL(12,2) NOT NULL,
    currency CHAR(3) DEFAULT 'ARS',
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_hub_status ON orders(hub_id, status, created_at DESC);
CREATE INDEX idx_orders_buyer ON orders(buyer_user_id, created_at DESC);
CREATE INDEX idx_orders_provider ON orders(provider_id, status);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    offering_id UUID NOT NULL REFERENCES offerings(id),
    name_snapshot VARCHAR(300) NOT NULL,        -- fotografía del nombre al comprar
    price_snapshot DECIMAL(12,2) NOT NULL,      -- fotografía del precio al comprar
    quantity INTEGER NOT NULL DEFAULT 1,
    subtotal DECIMAL(12,2) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

**Snapshots:** si mañana el proveedor cambia el precio o el nombre del producto, el pedido histórico no se rompe. Esto es clave para auditoría y para facturación.

#### `transactions` — Mercado Pago

```sql
CREATE TYPE transaction_status AS ENUM (
    'pending', 'approved', 'in_process', 'rejected', 'refunded', 'cancelled'
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    user_id UUID NOT NULL REFERENCES users(id),
    hub_id UUID NOT NULL REFERENCES hubs(id),
    amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) DEFAULT 'ARS',
    status transaction_status DEFAULT 'pending',
    payment_method VARCHAR(50),                 -- 'credit_card', 'pix', etc.
    provider VARCHAR(50) DEFAULT 'mercadopago',
    provider_payment_id VARCHAR(200) UNIQUE,    -- ID en MP
    provider_preference_id VARCHAR(200),
    raw_response JSONB,                         -- respuesta cruda de MP
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tx_order ON transactions(order_id);
CREATE INDEX idx_tx_user ON transactions(user_id, created_at DESC);
CREATE INDEX idx_tx_provider_id ON transactions(provider_payment_id);
```

#### `collective_rounds` — rondas colectivas con cuenta corriente

Esta es una feature pesada, la pienso como un **libro mayor de movimientos**. Nunca calculás saldos sumando cosas al vuelo: cada movimiento deja una línea.

```sql
CREATE TYPE round_status AS ENUM ('draft', 'open', 'closed', 'settled');
CREATE TYPE round_tx_type AS ENUM ('contribution', 'purchase', 'adjustment', 'settlement');

CREATE TABLE collective_rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hub_id UUID NOT NULL REFERENCES hubs(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    status round_status DEFAULT 'draft',
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE round_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES collective_rounds(id),
    user_id UUID NOT NULL REFERENCES users(id),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(round_id, user_id)
);

CREATE TABLE round_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES collective_rounds(id),
    user_id UUID NOT NULL REFERENCES users(id),
    type round_tx_type NOT NULL,
    amount DECIMAL(12,2) NOT NULL,              -- positivo aporta, negativo consume
    description TEXT,
    reference_order_id UUID REFERENCES orders(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_movements_user_round ON round_movements(round_id, user_id, created_at);
```

Para saber el saldo de un usuario en una ronda: `SELECT SUM(amount) FROM round_movements WHERE round_id = X AND user_id = Y`. Si esto te empieza a pesar, agregás una **vista materializada** con los saldos, que se refresca cada X minutos.

#### `notifications` — cola persistente de notificaciones

```sql
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');
CREATE TYPE notification_channel AS ENUM ('whatsapp', 'email', 'push', 'sms');

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    hub_id UUID REFERENCES hubs(id),
    channel notification_channel NOT NULL,
    template VARCHAR(100) NOT NULL,             -- 'order_confirmed', etc.
    payload JSONB NOT NULL,                     -- datos para renderizar
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    status notification_status DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_pending ON notifications(scheduled_for)
    WHERE status = 'pending';
```

#### `audit_log` — la memoria del sistema

```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    hub_id UUID REFERENCES hubs(id),
    action VARCHAR(100) NOT NULL,               -- 'order.created', 'user.role_changed'
    entity_type VARCHAR(50),
    entity_id UUID,
    changes JSONB,                              -- before/after
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);
```

---

## 4. Organización del código ⚙️

No pongas todo en `flowService.js`. A medida que crezca, dividí así:

```
src/
├── api/                    # rutas HTTP (webhooks, health)
│   └── webhooks/
│       └── whatsapp.js
├── modules/                # cada "módulo de negocio" es independiente
│   ├── users/
│   │   ├── user.repository.js
│   │   ├── user.service.js
│   │   └── user.model.js
│   ├── hubs/
│   ├── orders/
│   ├── payments/
│   ├── notifications/
│   └── rounds/
├── flows/                  # flujos de conversación de WhatsApp
│   ├── onboarding.flow.js
│   ├── place-order.flow.js
│   └── flow.engine.js      # motor genérico de flujos
├── queue/                  # trabajos en cola
│   ├── workers/
│   │   ├── notification.worker.js
│   │   ├── payment.worker.js
│   │   └── whatsapp.worker.js
│   └── queue.js
├── infrastructure/         # conexiones externas
│   ├── db.js
│   ├── redis.js
│   ├── meta.js
│   └── mercadopago.js
├── events/                 # event bus interno
│   ├── eventBus.js
│   └── handlers/
└── config/
    └── index.js            # toda la config desde env vars
```

**Por qué este patrón:** el día que quieras separar "payments" en un microservicio propio, movés una carpeta. No reescribís nada.

---

## 5. Próximos pasos concretos 🔧

### Paso 1 (URGENTE): resolver el token de Meta que vence cada 24hs

El token que estás usando es un **token de usuario temporal**. Lo que necesitás es un **System User Access Token**, que no vence.

**Cómo se hace (en Meta Business Manager):**

1. Entrá a `business.facebook.com` → Configuración del negocio.
2. **Usuarios → Usuarios del sistema → Agregar**. Ponele un nombre tipo `hubya-backend`.
3. Asignale el rol de **Administrador** sobre la cuenta de WhatsApp Business.
4. Click en el system user creado → **Generar nuevo token**.
5. Elegí la app de tu proyecto y marcá los permisos: `whatsapp_business_messaging`, `whatsapp_business_management`.
6. **En "Vencimiento" elegí "Nunca"**.
7. Copiá el token y guardalo en Railway como variable de entorno: `META_ACCESS_TOKEN`.
8. En tu código, leé siempre `process.env.META_ACCESS_TOKEN`. Jamás lo pongas hardcodeado.

### Paso 2: crear la base de datos con las migraciones

Usá una herramienta de migraciones (ej: **node-pg-migrate** o **Prisma**). Nunca hagas cambios "a mano" en la base. Cada cambio es un archivo versionado en Git.

### Paso 3: agregar Redis + BullMQ a Railway

Railway tiene un addon de Redis. Lo agregás con un click. Después, en tu código:

```js
import { Queue, Worker } from 'bullmq';
const connection = { url: process.env.REDIS_URL };

export const notificationQueue = new Queue('notifications', { connection });

// En un proceso separado (otro servicio en Railway):
new Worker('notifications', async (job) => {
  await sendWhatsApp(job.data);
}, { connection });
```

### Paso 4: separar el bot del worker en Railway

En Railway creá **dos servicios** del mismo repo:
- **web**: corre `npm run start:api` (tu bot actual)
- **worker**: corre `npm run start:worker` (los workers de la cola)

Mismo código, procesos separados, escalables independientemente.

### Paso 5: usuarios de prueba (seed)

Creá un script `npm run seed` que poble la base con:
- 3 hubs (Palermo, Salta Capital, Mendoza)
- 20 vecinos de prueba
- 5 proveedores de productos (almacén, panadería, verdulería, carnicería, farmacia)
- 5 proveedores de servicios (jardinero, plomero, electricista, fumigador, albañil)
- Categorías con jerarquía real
- Un par de pedidos de ejemplo en cada estado

Este seed es oro: te permite probar el sistema en segundos después de cualquier cambio.

---

## 6. Roadmap ordenado por dependencia

| Orden | Feature | Por qué va primero |
|-------|---------|-------------------|
| 1 | Token permanente de Meta | Sin esto nada funciona |
| 2 | Migraciones + esquema base | Todo lo demás depende de la DB |
| 3 | Seed de datos de prueba | Para poder probar sin ensuciar prod |
| 4 | Redis + colas + worker separado | Desbloquea todo lo asíncrono |
| 5 | Aceptación de términos en el flow | Blindaje legal antes de crecer |
| 6 | Geolocalización de hubs | Necesaria para que un vecino encuentre su hub |
| 7 | Flujo de búsqueda + pedido | Core del producto |
| 8 | Integración Mercado Pago | Primero sandbox, después prod |
| 9 | Notificaciones automáticas | Usa la cola ya montada |
| 10 | Rondas colectivas | Feature compleja, va después del core |
| 11 | Panel web de métricas | Cuando el core esté estable |

---

## 7. Reglas de oro para no arrepentirte 🧠

1. **Commiteá seguido, con mensajes claros.** Tu "yo" del futuro te lo agradece.
2. **Nunca pushees secrets a GitHub.** Ni siquiera un segundo. GitHub los indexa y en 10 minutos alguien te los robó.
3. **Escribí tests para lo crítico** (pagos, rondas, roles). El resto puede esperar.
4. **Loggeá todo con contexto** (user_id, hub_id, request_id). Cuando algo falle, vas a poder encontrarlo.
5. **Mide antes de optimizar.** No inventes problemas que no tenés.
6. **Backups automáticos diarios de PostgreSQL.** Railway lo hace, pero verificá que estén corriendo y hacé una restauración de prueba.
7. **Monitoreo desde el día uno** (Railway tiene métricas; sumá Sentry para errores en código).
8. **No te cases con una tecnología.** Si mañana Railway no te sirve, tu stack (Node + Postgres + Redis) corre en cualquier lado.

---

## 8. Glosario rápido

- **Stateless:** que no guarda información entre un request y otro.
- **Cola (queue):** lista donde se encolan trabajos para que otros los procesen.
- **Worker:** proceso que saca trabajos de la cola y los ejecuta.
- **Multi-tenancy:** un sistema que sirve a múltiples clientes con sus datos separados.
- **UUID:** identificador único de 128 bits, imposible de adivinar, generable en cualquier lado.
- **JSONB:** tipo de dato de PostgreSQL para guardar JSON indexado y consultable.
- **PostGIS:** extensión de PostgreSQL para datos geográficos (lat/lng, distancias).
- **Idempotencia:** propiedad de una operación que da el mismo resultado si se ejecuta 1 o 100 veces.
- **Soft delete:** marcar como borrado sin borrar físicamente.
- **Particionado:** dividir una tabla enorme en pedazos por fecha o rango para que siga siendo rápida.
- **Migración:** archivo de código que describe un cambio en el esquema de la base.

---

**Este documento es tu mapa. No tenés que entender todo hoy.** Empezá por el Paso 1 del Roadmap y avanzá en orden. Cuando te trabes en algo, volvé acá y preguntame por la sección específica.

Vas solo pero no estás solo. Vamos.
