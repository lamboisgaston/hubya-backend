# HubYa Backend

Motor de conversación WhatsApp para proveedores HubYa.  
**Node.js + Express + PostgreSQL (Prisma) + Meta Cloud API + Railway**

---

## Stack

| Capa | Tecnología |
|---|---|
| Servidor | Node.js + Express |
| Base de datos | PostgreSQL + Prisma ORM |
| WhatsApp | Meta Cloud API (directo, sin intermediarios) |
| Deploy | Railway |

---

## Pasos para arrancar — en orden exacto

### PASO 1 — Crear la app de Meta

1. Ir a [developers.facebook.com](https://developers.facebook.com)
2. **Mis apps → Crear app → Empresa**
3. Nombre: `HubYa`
4. En el dashboard de la app → **Agregar producto → WhatsApp**
5. Seleccionar o crear una cuenta de WhatsApp Business (WABA)

### PASO 2 — Obtener las credenciales

En **WhatsApp → Configuración de la API**:

| Variable | Dónde la encontrás |
|---|---|
| `META_ACCESS_TOKEN` | "Token de acceso temporal" (dura 24h para dev) / para producción crear un System User Token permanente |
| `META_PHONE_NUMBER_ID` | ID del número de teléfono de prueba |
| `META_WABA_ID` | ID de la cuenta de WhatsApp Business |

### PASO 3 — Deploy en Railway

```bash
# 1. Subir el código a GitHub
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/TU_USUARIO/hubya-backend
git push -u origin main

# 2. En railway.app
# Nuevo proyecto → Deploy from GitHub → elegir tu repo
# Agregar servicio: + → Database → PostgreSQL
# Railway auto-completa DATABASE_URL
```

Agregar variables de entorno en Railway (Settings → Variables):
```
META_ACCESS_TOKEN=EAAxxxxx
META_PHONE_NUMBER_ID=123456789
META_WEBHOOK_VERIFY_TOKEN=hubya_webhook_2024
META_WABA_ID=987654321
META_API_VERSION=v19.0
```

Railway te da una URL pública: `https://hubya-backend-production.up.railway.app`

### PASO 4 — Configurar el webhook en Meta

1. En tu app de Meta → **WhatsApp → Configuración**
2. **Webhook → Configurar webhook**
3. URL: `https://hubya-backend-production.up.railway.app/webhook/whatsapp`
4. Token de verificación: `hubya_webhook_2024` (el mismo de la variable)
5. Campos a suscribir: `messages` ✅

### PASO 5 — Configurar la DB y datos iniciales

```bash
# Una sola vez, desde tu máquina local con DATABASE_URL apuntando a Railway:
npm run db:push   # Crea las tablas
npm run db:seed   # Carga datos de ejemplo
```

### PASO 6 — Probar

1. En Meta Developers → WhatsApp → Configuración de la API
2. Sección "Enviar y recibir mensajes"
3. Número destino: tu número personal (lo agregás como número de prueba)
4. Mandar un mensaje al número sandbox de Meta
5. Deberías recibir el menú de HubYa

---

## Para producción — Token permanente

El token temporal dura 24 horas. Para producción:

1. Meta Business Suite → **Configuración → Usuarios del sistema**
2. Crear usuario del sistema → Administrador
3. Agregar activos → la app HubYa → Permiso: `whatsapp_business_messaging`
4. Generar token → seleccionar app → permisos: `whatsapp_business_messaging`, `whatsapp_business_management`
5. Copiar el token → ponerlo en `META_ACCESS_TOKEN` en Railway

---

## Estructura del proyecto

```
hubya-backend/
├── prisma/
│   └── schema.prisma          # Todas las tablas
├── scripts/
│   └── seed.js                # Datos iniciales
├── src/
│   ├── index.js               # Servidor Express
│   ├── routes/
│   │   ├── webhook.js         # GET + POST /webhook/whatsapp
│   │   └── api.js             # API REST interna
│   ├── controllers/
│   │   └── webhookController.js  # Parsea mensajes de Meta
│   ├── services/
│   │   ├── flowService.js     # Motor del flujo conversacional
│   │   ├── wpService.js       # Envía mensajes via Meta Cloud API
│   │   ├── dbService.js       # Queries a la DB
│   │   └── sesionService.js   # Estado de cada conversación
│   └── utils/
│       └── format.js
└── .env.example
```

---

## Cómo funciona el flujo

```
Usuario toca botón en WP
        ↓
Meta hace POST a /webhook/whatsapp
(formato: entry[].changes[].value.messages[])
        ↓
webhookController parsea el mensaje
        ↓
sesionService carga step + ctx de la DB
        ↓
flowService decide la respuesta según el step
        ↓
wpService llama a graph.facebook.com/v19.0/{PHONE_ID}/messages
        ↓
sesionService guarda el nuevo step + ctx
```

---

## Costos Meta Cloud API

| Conversación | Precio (aprox.) |
|---|---|
| Iniciada por usuario | Gratis las primeras 1.000/mes |
| Iniciada por negocio (notificación) | ~U$D 0.05 por conversación de 24h |

Las primeras **1.000 conversaciones por mes son gratis** — suficiente para arrancar.

---

## Próximos pasos

- [ ] Completar todos los pasos del flujo del proveedor en `flowService.js`
- [ ] Flujo del vecino (HueveroYA)
- [ ] Cron job para avisos automáticos de vencimientos
- [ ] Integración Mercado Pago
- [ ] Dashboard web de métricas
