# _legacy — Código archivado

## Qué es esta carpeta

Contiene el código original del bot HubYa **antes de la migración al esquema nuevo** (abril 2026).

## Por qué está archivado

En abril 2026 se reescribió completamente el esquema de base de datos (PR 1) para cumplir con las convenciones de `ARCHITECTURE.md`: UUIDs, multi-tenancy real por hub, soft deletes, timestamps con timezone, y soporte para la feature de Hubs Fundadores.

El código de esta carpeta usa el esquema viejo (modelos `Proveedor`, `Vecino`, `Cliente`, `Pedido`, `Sesion`, `HubProveedor`, etc.) que ya no existe en la base de datos. **No funciona y no debe usarse.**

## Cómo usarlo

Solo como referencia histórica para entender la lógica de negocio al implementar las features en el nuevo esquema. No importar ni requerir nada de esta carpeta en código nuevo.

## Features que vale la pena revisar al reimplementar

- **ComerciarYA** (`services/flowService.js` → `flujoComerciar`) — rondas colectivas con carrito, descuentos por volumen y cierre de ronda. Lógica de negocio interesante en `services/dbService.js` → `cerrarRonda`.
- **JardinerosYA / FumigadoresYA** (`services/flowService.js` → `flujoServicio`) — solicitud de servicio con notificación a múltiples proveedores del hub (vínculo doble).
- **Votaciones del hub** (`services/flowService.js` → `flujoHub`) — crear propuestas y votar, habilitado con 5+ vecinos.
- **Panel Admin/Proveedor** (`services/flowService.js` → `flujoAdmin`) — gestión de rondas, solicitudes y caja vía WhatsApp.
- **wpService.js** — ya migrado, quedó en `src/services/wpService.js`.
