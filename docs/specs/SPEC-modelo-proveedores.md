# SPEC — Modelo de Proveedores

**Fecha:** 2026-04-20
**Estado:** Pendiente de implementación
**Para:** Gastón

---

## Contexto

HubYa monetiza cobrándole a los proveedores por aparecer en los hubs.
Los vecinos usan el bot gratis y son quienes califican. HubYa actúa
como curador: si un proveedor pierde estrellas, HubYa lo reemplaza.

Este spec describe cómo funciona el lado del proveedor:
alta, cobro, cupos por rubro, sistema de estrellas y reemplazo.

---

## 1. Filosofía del modelo

- **Mayorista directo, sin intermediarios.** HubYa busca conectar al
  vecino con el mayorista especializado del rubro, no con un revendedor.
- **Calidad garantizada por curaduría con datos.** Las estrellas que
  dan los vecinos deciden qué proveedor sigue y cuál sale.
- **Competencia sana, no monopolio.** Cada hub tiene varios proveedores
  por rubro compitiendo por las ventas — los buenos crecen, los malos
  pierden cupo.
- **HubYa es quien decide.** Ni el admin del hub ni los vecinos eligen
  qué proveedor entra. Decide HubYa basándose en estrellas históricas y
  cumplimiento.

---

## 2. Onboarding del proveedor

Cuando alguien elige "Soy proveedor" en el split inicial:

### Paso 2.1 — Nombre del comercio
Validación: mínimo 3, máximo 200 caracteres.

### Paso 2.2 — Categoría
Botones: "Producto" / "Servicio".
Determina cuántos cupos compite por hub (ver sección 3).

### Paso 2.3 — Rubro
Lista predefinida según categoría:
- Productos: VerdulerosYA, HueverosYA, CarnicerosYA, AgroquímicosYA, etc.
- Servicios: JardinerosYA, PlomerosYA, PintoresYA, PiletaYA, etc.

Si el rubro no está en la lista, opción "Otro" → texto libre + revisión
manual de HubYa.

### Paso 2.4 — Zona de cobertura
Pide ubicación + radio en km (ej: 10 km a la redonda de tu depósito).
Determina automáticamente en qué hubs puede aparecer el proveedor.

### Paso 2.5 — Datos del titular
Nombre, DNI, teléfono de contacto comercial, email.

### Paso 2.6 — Documentos (carga de archivos)
- Habilitación municipal (si aplica al rubro).
- ART (si tiene empleados).
- Constancia de inscripción AFIP (CUIT).

### Paso 2.7 — Plan de suscripción
Mostrar planes disponibles (definir precios después). Pago vía Mercado Pago.

### Paso 2.8 — Confirmación
Mensaje: "Recibimos tu solicitud. Te contactamos en 48hs para
activar tu cuenta y asignarte a los hubs disponibles en tu zona."

---

## 3. Cupos por rubro por hub

Regla principal: **límite de proveedores por rubro por hub** según la
naturaleza del rubro.

| Categoría | Cupo máximo por hub | Razón |
|-----------|---------------------|-------|
| **Productos** (compras) | 2 | Comoditizables, competencia por precio funciona con 2 |
| **Servicios** | 5 | Disponibilidad, química personal, variedad real |

### Comportamiento de los cupos

- Cuando los cupos están llenos, el rubro está **"cerrado"** para nuevos
  proveedores en ese hub.
- Si un proveedor es removido (por mala calificación o se va), el cupo
  queda libre y otros pueden postularse.
- Los cupos son **por hub** — Juan puede estar en el hub Centro y libre
  en el hub Norte.

---

## 4. Asignación de proveedores a hubs

Cuando hay un cupo libre y varios proveedores quieren entrar al rubro:

**Criterio principal:** estrellas históricas en otros hubs.
- El proveedor con mejor promedio histórico entra primero.
- Si es la primera vez que opera en HubYa (sin historial), entra al final
  de la cola.

**Empate:** orden de antigüedad de la solicitud (FIFO).

---

## 5. Modelo de cobro

### Suscripción mensual a HubYa
- Precio base por hub asignado.
- Descuentos progresivos por cantidad de hubs (ej: 5 hubs = 10% off).
- Pago automático mensual vía Mercado Pago.

### Si falla el pago
1. Se da 7 días de gracia.
2. Si no paga, se le suspende temporalmente (sigue en DB pero deja de
   aparecer en los menús de los hubs).
3. Si pasan 30 días sin pagar, se libera el cupo.

### Cupos vs zona de cobertura
- El proveedor define una zona (radio en km).
- HubYa lo asigna a los hubs que están dentro de esa zona Y tienen cupo
  libre en su rubro.
- El proveedor paga solo por los hubs donde efectivamente aparece, no
  por todos los que están en su zona.

---

## 6. Sistema de calificación

### Origen de las calificaciones
Las estrellas vienen de la **encuesta mensual** que HubYa envía a los
vecinos (ver `SPEC-flujo-vecino-completo.md`, sección 4).

No hay calificación por operación. Es una decisión consciente para
reducir la fricción del vecino.

### Cálculo del promedio de un proveedor en un hub
- Se promedian las **últimas 6 calificaciones mensuales** del proveedor
  en ese hub específico.
- Si un mes el vecino no calificó (porque no operó), no cuenta para el
  cálculo.
- Cada hub tiene su propio promedio del proveedor — Juan puede tener
  4.8 en el hub Centro y 3.2 en el hub Norte. HubYa los trata por separado.

### Promedio histórico del proveedor (para asignación a nuevos hubs)
- Se promedia el rendimiento de **todos los hubs** donde opera o ha
  operado.
- Se usa para decidir el orden de asignación cuando se libera un cupo
  en otro hub.

---

## 7. Sistema de baja por mala calificación

### Umbral de advertencia
- Si el promedio del proveedor en un hub cae bajo **3.0 estrellas**
  sostenido por **2 meses consecutivos** → HubYa envía advertencia.

Mensaje al proveedor:
"Tu calificación promedio en el hub [Nombre] cayó bajo 3 estrellas en
los últimos 2 meses. Tenés un mes para mejorar antes de que liberemos
el cupo."

### Período de gracia
- 30 días para revertir.
- HubYa puede contactar al proveedor para entender el problema y ofrecer
  ayuda (cambio de modalidad, capacitación, etc.).

### Liberación del cupo
- Si en el siguiente mes el promedio sigue bajo 3.0 → HubYa libera el
  cupo en ese hub.
- El proveedor sigue activo en otros hubs donde su calificación sea
  buena.
- HubYa busca reemplazo entre los proveedores en lista de espera del
  rubro.

---

## 8. Datos a guardar en DB

### Modificaciones a la tabla `providers` (ya existe)
- `subscriptionStatus`: enum (active, past_due, suspended, cancelled).
- `subscriptionPlan`: string.
- `coverageRadiusKm`: integer.
- `coverageCenter`: { lat, lng }.

### Tabla nueva `provider_hub_assignments`
Relaciona proveedores con hubs activos.
- `id` (uuid)
- `providerId`
- `hubId`
- `status`: enum (active, warning, removed).
- `currentRating`: decimal (promedio actual).
- `assignedAt`
- `removedAt` (nullable)

### Tabla nueva `provider_documents`
- `id` (uuid)
- `providerId`
- `type`: enum (habilitacion_municipal, art, afip, otro).
- `fileUrl`
- `expiresAt` (nullable)
- `uploadedAt`

### Tabla nueva `subscription_payments`
Historial de cobros mensuales.
- `id` (uuid)
- `providerId`
- `amount`
- `status`: enum (pending, paid, failed, refunded).
- `mercadoPagoId`
- `period` (yyyy-mm)
- `createdAt`

---

## 9. PRs sugeridos para implementar este spec

Orden sugerido:

1. **PR — Schema de DB de proveedores.** Agregar las 3 tablas nuevas y
   los campos faltantes en `providers`.

2. **PR — Onboarding del proveedor en el bot.** Flow completo desde
   "Soy proveedor" hasta carga de documentos.

3. **PR — Asignación a hubs por zona.** Lógica que toma un proveedor y
   lo asigna a los hubs que entran en su zona y tienen cupo libre.

4. **PR — Integración Mercado Pago.** Suscripciones recurrentes,
   webhooks de pago.

5. **PR — Worker de calificaciones.** Cálculo de promedios mensuales
   y disparo de advertencias / liberación de cupos.

6. **PR — Dashboard del proveedor (web).** Para que el proveedor vea
   su calificación, sus hubs, sus pagos.

---

## 10. Lo que NO incluye este spec

- El flujo del vecino (ver `SPEC-flujo-vecino-completo.md`).
- El sistema de pedidos / órdenes de compra (cómo el vecino le compra
  al proveedor — eso es otro spec más adelante).
- El módulo de logística (cómo se entregan los productos / se coordinan
  los servicios).
- El dashboard interno de HubYa (para que nosotros veamos métricas).
