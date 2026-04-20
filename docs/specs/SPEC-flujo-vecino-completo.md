# SPEC — Flujo del Vecino Completo

**Fecha:** 2026-04-20
**Estado:** Pendiente de implementación
**Para:** Gastón

---

## Contexto

Hoy el bot lleva al usuario directo al onboarding de vecino. Falta:

1. Una pregunta inicial que separe "vecino" de "proveedor".
2. Un menú post-unión al hub que muestre los proveedores disponibles.
3. Un sistema de calificación mensual de proveedores.

Este spec describe el flujo completo del lado del vecino, de principio a fin.

---

## 1. Pregunta inicial — Split vecino/proveedor

Cuando un usuario nuevo escribe al bot por primera vez (cualquier mensaje), responde:

¡Bienvenido a HubYa! Pregunta: ¿Cómo querés sumarte? Opciones: Soy vecino / Soy proveedor.

- Si elige "Soy vecino" → arranca el onboarding de vecino (sección 2).
- Si elige "Soy proveedor" → arranca el onboarding de proveedor (ver SPEC-modelo-proveedores.md).

La elección queda guardada en users.metadata.role_intent.

---

## 2. Onboarding del vecino

Solo 3 datos obligatorios y 1 opcional.

### 2.1 — Nombre
Validación: mínimo 2 caracteres, máximo 80.

### 2.2 — Ubicación
Reusar el flow de share-location.flow.js que ya existe.

### 2.3 — Email (opcional)
Botones: "Sí, lo agrego" o "Saltar este paso".
Si elige Sí, valida formato de email.

---

## 3. Post-unión al hub — Menú principal

Una vez que el vecino se unió a un hub, mostrar inmediatamente:

Mensaje: "Listo, ya estás en el hub [Nombre]. Somos N vecinos en este momento."

Botones del menú principal:
- Servicios
- Compras
- Ver vecinos del hub

### Submenú Servicios
Lista los rubros de servicios disponibles en este hub específico.
Ejemplos: JardinerosYA, PlomerosYA, PintoresYA, PiletaYA.
Si un rubro no tiene proveedores, no aparece.

Al tocar un rubro, muestra hasta 5 proveedores con: nombre, estrellas, cantidad de calificaciones, mínimo de compra/contratación, tiempo de respuesta, botón Contactar.

### Submenú Compras
Mismo formato pero con rubros de productos.
Ejemplos: VerdulerosYA, HueverosYA, AgroquímicosYA.
Cada rubro muestra hasta 2 proveedores (en compras hay menos cupo, ver SPEC-modelo-proveedores.md).

### Submenú Ver vecinos
Solo muestra nombres, no datos de contacto. Privacidad por defecto.

---

## 4. Encuesta mensual de calificación

Día 1 de cada mes, a cada vecino activo:

"Hola [Nombre], ¿cómo va todo en el hub [Nombre]? Te queremos hacer unas preguntas rápidas sobre tus proveedores de este mes."

Para cada proveedor con el que el vecino tuvo al menos 1 operación en los últimos 30 días:
- Calificación de 1 a 5 estrellas (botones).
- Comentario opcional.

Pregunta final abierta: "¿Hay algún rubro que te falta en el hub?"

### Cálculo del promedio
- Se promedian las últimas 6 calificaciones mensuales del proveedor en ese hub.
- Si un mes el vecino no calificó (porque no operó), no cuenta.

### Umbral de baja
- Si el promedio cae bajo 3.0 estrellas sostenido por 2 meses consecutivos → advertencia al proveedor.
- Si en el siguiente mes no mejora → HubYa libera el cupo y busca reemplazo.

---

## 5. Datos a guardar en DB

### Tabla users
- metadata.role_intent: "vecino" o "proveedor"
- email: opcional, ya existe en el schema.

### Tabla nueva monthly_ratings
- id (uuid)
- userId (vecino que califica)
- providerId (proveedor calificado)
- hubId
- month (yyyy-mm)
- stars (1-5)
- comment (opcional)
- createdAt

### Tabla nueva hub_rubro_requests
- id (uuid)
- userId
- hubId
- rubro (texto libre)
- createdAt

---

## 6. PRs sugeridos para implementar este spec

1. PR — Split inicial vecino/proveedor.
2. PR — Menú post-unión al hub.
3. PR — Submenús de servicios y compras.
4. PR — Encuesta mensual.
5. PR — Lógica de baja por estrellas bajas.

---

## 7. Lo que NO incluye este spec

- El flujo del proveedor (ver SPEC-modelo-proveedores.md).
- Mercado Pago.
- Dashboard interno de HubYa.
- Notificaciones push (depende de PR 4).
