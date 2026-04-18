// src/services/flowService.js
// Motor de conversación HubYa — flujo completo

"use strict";

const { PrismaClient } = require("@prisma/client");
const db               = require("./dbService");
const { pesos, bold, italic } = require("../utils/format");

const prisma = new PrismaClient();

// ─── Utilidades ───────────────────────────────────────────────────────────────

// Distancia en km entre dos pares de coordenadas (Haversine)
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Resultado estándar del flujo
function ok(step, ctx, mensajes, notificar = null) {
  const res = { nuevoStep: step, nuevoCtx: ctx, mensajes };
  if (notificar) res.notificar = notificar;
  return res;
}

// Extrae el id de navegación del input (botón/lista) o null para texto
function btnId(input) {
  return (input.tipo === "boton" || input.tipo === "lista") ? (input.valor || "") : null;
}

// Extrae texto libre del input
function txt(input) {
  return (input.tipo === "texto" || input.tipo === "ubicacion") ? (input.valor || "").trim() : "";
}

// ─── Entrada principal ────────────────────────────────────────────────────────

exports.procesar = async (sesion, input) => {
  const step = sesion.step || "start";
  const ctx  = sesion.ctx  || {};
  const id   = btnId(input);
  const text = txt(input).toLowerCase();

  // Comandos globales de reset (sólo para mensajes de texto)
  if (!id && ["menu", "hola", "inicio", "0"].includes(text)) {
    return menuPrincipal(sesion);
  }

  // Ruteo por id de botón — intent-based
  if (id) {
    console.log(`🔀 [flow] id="${id}" step="${step}"`);
    if (id === "start")           return menuPrincipal(sesion);
    if (id.startsWith("reg_"))    return flujoRegistroBtn(sesion, input, id, ctx);
    if (id.startsWith("com_"))    return flujoComerciar(sesion, input, id, ctx);
    if (id.startsWith("srv_"))    return flujoServicio(sesion, input, id, ctx);
    if (id.startsWith("hub_"))    return flujoHub(sesion, input, id, ctx);
    if (id.startsWith("adm_"))    return flujoAdmin(sesion, input, id, ctx);
    return menuPrincipal(sesion);
  }

  // Ruteo por step — entrada de texto libre
  if (step === "start")           return menuPrincipal(sesion);
  if (step.startsWith("reg_"))    return flujoRegistro(sesion, input, step, ctx);
  if (step.startsWith("com_"))    return flujoComerciar(sesion, input, step, ctx);
  if (step.startsWith("srv_"))    return flujoServicio(sesion, input, step, ctx);
  if (step.startsWith("hub_"))    return flujoHub(sesion, input, step, ctx);
  if (step.startsWith("adm_"))    return flujoAdmin(sesion, input, step, ctx);

  return menuPrincipal(sesion);
};

// ─── Menú principal ───────────────────────────────────────────────────────────

async function menuPrincipal(sesion) {
  const tel  = sesion.telefono;
  const tipo = sesion.tipo;

  // Panel proveedor
  if (tipo === "proveedor") {
    const prov = await prisma.proveedor.findUnique({ where: { id: sesion.proveedorId } });
    return ok("start", {}, [{
      tipo:    "botones",
      texto:   `👋 ${bold("Hola " + (prov?.nombre || "") + "!")} — HubYa Panel Proveedor\n\n¿Qué querés gestionar?`,
      botones: [
        { id: "adm_pedidos",   label: "📋 Rondas activas" },
        { id: "adm_servicios", label: "🛠️ Solicitudes"    },
        { id: "adm_caja",      label: "💰 Caja del día"   },
      ],
    }]);
  }

  // Vecino: verificar registro
  const vecino = await db.getVecino(tel);

  if (!vecino) {
    return ok("reg_nombre", {}, [{
      tipo:  "texto",
      texto: `👋 ${bold("¡Bienvenido a HubYa!")}\n${italic("Inteligencia Colectiva Barrial")}\n\nPara comenzar, ¿cuál es tu nombre completo?`,
    }]);
  }

  const hub      = vecino.hubId ? await prisma.hub.findUnique({ where: { id: vecino.hubId } }) : null;
  const saldoNet = await db.getSaldoVecino(tel);
  const saldoStr = saldoNet > 0
    ? `\n💰 Crédito: ${bold(pesos(saldoNet))}`
    : saldoNet < 0
      ? `\n⚠️ Deuda: ${bold(pesos(-saldoNet))}`
      : "";

  return ok("start", {}, [{
    tipo:    "botones",
    texto:   `👋 ${bold("¡Hola " + vecino.nombre + "!")} — HubYa\n📍 ${hub ? hub.nombre : "Sin hub asignado"}${saldoStr}\n\n¿Qué querés hacer hoy?`,
    botones: [
      { id: "com_inicio", label: "🛒 ComerciarYA" },
      { id: "srv_menu",   label: "🛠️ Servicios"   },
      { id: "hub_inicio", label: "🏘️ Mi Hub"       },
    ],
  }]);
}

// ─── REGISTRO DE VECINO ───────────────────────────────────────────────────────

async function flujoRegistro(sesion, input, step, ctx) {
  const tel = sesion.telefono;
  const val = txt(input);

  switch (step) {

    case "reg_nombre": {
      if (!val || val.length < 2) {
        return ok("reg_nombre", ctx, [{
          tipo:  "texto",
          texto: "Por favor escribí tu nombre completo (mínimo 2 caracteres).",
        }]);
      }
      return ok("reg_ubicacion", { ...ctx, nombre: val }, [{
        tipo:  "texto",
        texto: `Perfecto, ${bold(val)} 🙌\n\nAhora necesito tu ubicación para encontrar los hubs más cercanos.\n\n📍 Compartí tu ubicación desde WhatsApp (📎 → Ubicación) o escribí tus coordenadas en formato: ${italic("latitud,longitud")}`,
      }]);
    }

    case "reg_ubicacion": {
      let lat, lng;

      if (input.tipo === "ubicacion") {
        lat = input.lat;
        lng = input.lng;
      } else if (val.includes(",")) {
        // Coordenadas escritas manualmente: "-34.6037,-58.3816"
        const partes = val.split(",");
        lat = parseFloat(partes[0]);
        lng = parseFloat(partes[1]);
      }

      if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        return ok("reg_ubicacion", ctx, [{
          tipo:  "texto",
          texto: "No recibí tu ubicación. Compartí tu ubicación de WhatsApp (📎 → Ubicación) o escribí las coordenadas como: ${italic('-34.6037,-58.3816')}",
        }]);
      }

      // Hubs cercanos (≤ 15 km), ordenados por distancia
      const hubs = await db.getHubs();
      const cercanos = hubs
        .map(h => ({
          ...h,
          dist: h.lat && h.lng ? distanciaKm(lat, lng, h.lat, h.lng) : 999,
        }))
        .filter(h => h.dist <= 15)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 8);

      if (!cercanos.length) {
        return ok("reg_ubicacion", { ...ctx, lat, lng }, [{
          tipo:  "texto",
          texto: "No encontré hubs en un radio de 15 km. Compartí tu ubicación nuevamente o escribinos a soporte.",
        }]);
      }

      return ok("reg_hub", { ...ctx, lat, lng }, [{
        tipo:       "lista",
        texto:      `📍 Encontré ${cercanos.length} hub(s) cerca tuyo. Elegí el más conveniente:`,
        botonLista: "Ver hubs",
        secciones:  [{
          titulo: "Hubs cercanos",
          items:  cercanos.map(h => ({
            id:          `reg_hub_${h.id}`,
            titulo:      h.nombre,
            descripcion: `${h.barrio} · ${h.dist.toFixed(1)} km`,
          })),
        }],
      }]);
    }

    default:
      return menuPrincipal(sesion);
  }
}

// El flujoRegistro también recibe respuestas de botones (reg_hub_<id>)
// Las ruteamos desde el despachador principal via el prefijo "reg_"
// Pero "reg_hub_X" empieza con "reg_" sin ser manejado ahí — necesita atención
// Solución: ampliar el despachador para cubrir también reg_ buttons
// (ver exports.procesar arriba — agrego handler inline aquí vía función separada)
exports._handleRegBtn = flujoRegistroBtn;

async function flujoRegistroBtn(sesion, input, id, ctx) {
  const tel = sesion.telefono;

  if (id.startsWith("reg_hub_")) {
    console.log(`🏘️ [flujoRegistroBtn] → ${id}`);
    const hubId = parseInt(id.replace("reg_hub_", ""), 10);
    if (!hubId) return menuPrincipal(sesion);

    const hub = await prisma.hub.findUnique({ where: { id: hubId } });
    if (!hub) return ok("start", {}, [{ tipo: "texto", texto: "Hub no encontrado." }]);

    const vecino = await db.crearVecino({
      nombre:   ctx.nombre || "Vecino",
      telefono: tel,
      hubId,
      lat:      ctx.lat || null,
      lng:      ctx.lng || null,
    });

    return ok("start", { vecinoId: vecino.id, hubId }, [{
      tipo:  "texto",
      texto: `✅ ${bold("¡Registro completado!")}\n\n¡Hola ${bold(vecino.nombre)}, ya sos parte de ${bold(hub.nombre)}! 🎉\n\nEscribí ${bold("menu")} para ver todo lo que podés hacer.`,
    }]);
  }

  return menuPrincipal(sesion);
}

// ─── COMERCIAYA — RONDAS COLECTIVAS ──────────────────────────────────────────

async function flujoComerciar(sesion, input, stepOrId, ctx) {
  const tel = sesion.telefono;
  const id  = btnId(input) || stepOrId;
  const val = txt(input);

  const vecino = await db.getVecino(tel);
  if (!vecino || !vecino.hubId) {
    return ok("start", {}, [{
      tipo:  "texto",
      texto: "Primero necesitás registrarte y unirte a un hub. Escribí tu nombre para comenzar.",
    }]);
  }

  // ── Elegir proveedor de la ronda ─────────────────────────
  if (stepOrId === "com_inicio") {
    console.log(`🛒 [flujoComerciar] → com_inicio`);
    const hps = await prisma.hubProveedor.findMany({
      where:   { hubId: vecino.hubId, activo: true },
      include: { proveedor: true },
    });

    if (!hps.length) {
      return ok("start", {}, [{
        tipo:  "texto",
        texto: "No hay rondas activas en tu hub por ahora. ¡Volvé pronto! 🙌",
      }]);
    }

    return ok("com_proveedor", { hubId: vecino.hubId }, [{
      tipo:       "lista",
      texto:      `🛒 ${bold("ComerciarYA")} — Rondas activas\n\nElegí el proveedor de tu hub:`,
      botonLista: "Ver rondas",
      secciones:  [{
        titulo: "Proveedores disponibles",
        items:  hps.map(hp => ({
          id:          `com_prov_${hp.proveedorId}`,
          titulo:      hp.proveedor.negocio,
          descripcion: hp.diaReparto ? `Reparte: ${hp.diaReparto}` : "Reparto a coordinar",
        })),
      }],
    }]);
  }

  // ── Elegir producto ──────────────────────────────────────
  if (id.startsWith("com_prov_")) {
    const provId = parseInt(id.replace("com_prov_", ""), 10);
    if (!provId) return flujoComerciar(sesion, input, "com_inicio", ctx);

    const productos = await db.getProductos(provId);
    if (!productos.length) {
      return ok("com_inicio", ctx, [{ tipo: "texto", texto: "Este proveedor no tiene productos disponibles ahora." }]);
    }

    // Agrupar por categoría
    const porCat = {};
    for (const p of productos) {
      const cat = p.categoria?.nombre || "General";
      (porCat[cat] = porCat[cat] || []).push(p);
    }

    const secciones = Object.entries(porCat).map(([cat, prods]) => ({
      titulo: cat,
      items:  prods.slice(0, 10).map(p => ({
        id:          `com_prod_${p.id}`,
        titulo:      p.nombre,
        descripcion: `Precio base: ${pesos(p.precioBase)}`,
      })),
    }));

    return ok("com_producto", { ...ctx, proveedorId: provId, carrito: ctx.carrito || [] }, [{
      tipo:       "lista",
      texto:      `🛒 ${bold("Elegí tus productos")}\n\nPrecios base — los descuentos se aplican al cerrar la ronda:`,
      botonLista: "Ver productos",
      secciones,
    }]);
  }

  // ── Elegir cantidad ──────────────────────────────────────
  if (id.startsWith("com_prod_")) {
    const prodId = parseInt(id.replace("com_prod_", ""), 10);
    if (!prodId) return flujoComerciar(sesion, input, `com_prov_${ctx.proveedorId}`, ctx);

    const prod = await db.getProducto(prodId);
    if (!prod) return ok("com_inicio", {}, [{ tipo: "texto", texto: "Producto no encontrado." }]);

    let descTexto = "";
    if (prod.descuentos.length) {
      descTexto = "\n\n📊 " + bold("Descuentos de ronda:") + "\n" +
        prod.descuentos.map(d =>
          `  • ${d.desde}${d.hasta < 999 ? `–${d.hasta}` : "+"} unidades → ${d.porcentaje}% off`
        ).join("\n");
    }

    return ok("com_cantidad", { ...ctx, productoId: prodId, prodNombre: prod.nombre, precioBase: prod.precioBase }, [{
      tipo:  "texto",
      texto: `🛒 ${bold(prod.nombre)}\nPrecio base: ${bold(pesos(prod.precioBase))}${descTexto}\n\n¿Cuántas unidades querés agregar a la ronda?`,
    }]);
  }

  // ── Procesar cantidad ingresada ──────────────────────────
  if (stepOrId === "com_cantidad") {
    const cant = parseInt(val, 10);
    if (isNaN(cant) || cant <= 0) {
      return ok("com_cantidad", ctx, [{ tipo: "texto", texto: "Ingresá un número válido mayor a 0." }]);
    }

    const carrito = [...(ctx.carrito || []), {
      productoId: ctx.productoId,
      nombre:     ctx.prodNombre,
      cantidad:   cant,
      precioUnit: ctx.precioBase,
    }];

    return mostrarCarrito(sesion, { ...ctx, carrito, productoId: null, prodNombre: null, precioBase: null });
  }

  // ── Ver/modificar carrito ────────────────────────────────
  if (stepOrId === "com_carrito" || id === "com_agregar") {
    if (id === "com_agregar") {
      return flujoComerciar(sesion, input, `com_prov_${ctx.proveedorId}`, ctx);
    }
    if (id === "com_confirmar") {
      return confirmarPedido(sesion, ctx);
    }
    return mostrarCarrito(sesion, ctx);
  }

  // ── Confirmar pedido ─────────────────────────────────────
  if (stepOrId === "com_confirmar_ok") {
    return crearPedido(sesion, ctx, vecino);
  }

  if (id === "com_confirmar_ok") {
    return crearPedido(sesion, ctx, vecino);
  }

  return flujoComerciar(sesion, input, "com_inicio", ctx);
}

async function mostrarCarrito(sesion, ctx) {
  const carrito = ctx.carrito || [];
  if (!carrito.length) {
    return ok("start", {}, [{ tipo: "texto", texto: "Tu carrito está vacío." }]);
  }

  const resumen = carrito.map(i =>
    `• ${i.nombre} × ${i.cantidad} = ${pesos(i.precioUnit * i.cantidad)}`
  ).join("\n");
  const total = carrito.reduce((s, i) => s + i.precioUnit * i.cantidad, 0);

  return ok("com_carrito", ctx, [{
    tipo:    "botones",
    texto:   `🛒 ${bold("Tu carrito:")}\n\n${resumen}\n\n${bold("Total base: " + pesos(total))}\n\n${italic("Los descuentos se aplican cuando el proveedor cierra la ronda. ¡Más vecinos = mejor precio!")}`,
    botones: [
      { id: "com_agregar",      label: "➕ Agregar más"     },
      { id: "com_confirmar",    label: "✅ Confirmar pedido" },
      { id: "start",            label: "❌ Cancelar"         },
    ],
  }]);
}

async function confirmarPedido(sesion, ctx) {
  const carrito = ctx.carrito || [];
  const total   = carrito.reduce((s, i) => s + i.precioUnit * i.cantidad, 0);
  const detalle = carrito.map(i => `• ${i.nombre} × ${i.cantidad}`).join("\n");

  return ok("com_confirmar", ctx, [{
    tipo:    "botones",
    texto:   `📋 ${bold("¿Confirmás tu pedido?")}\n\n${detalle}\n\n${bold("Total base: " + pesos(total))}\n\n${italic("Pagás el precio base ahora. Si la ronda alcanza descuentos, la diferencia se acredita en tu cuenta corriente.")}`,
    botones: [
      { id: "com_confirmar_ok", label: "✅ Confirmar"   },
      { id: "com_agregar",      label: "✏️ Modificar"   },
    ],
  }]);
}

async function crearPedido(sesion, ctx, vecino) {
  const carrito = ctx.carrito || [];
  if (!carrito.length) return menuPrincipal(sesion);

  // Obtener o crear Cliente del vecino para este proveedor
  let cliente = await prisma.cliente.findFirst({
    where: { telefono: sesion.telefono, proveedorId: ctx.proveedorId },
  });
  if (!cliente) {
    cliente = await prisma.cliente.create({
      data: {
        nombre:      vecino.nombre,
        telefono:    sesion.telefono,
        hubId:       vecino.hubId,
        proveedorId: ctx.proveedorId,
        saldo:       0,
      },
    });
  }

  const total  = carrito.reduce((s, i) => s + i.precioUnit * i.cantidad, 0);
  const pedido = await prisma.pedido.create({
    data: {
      clienteId:   cliente.id,
      proveedorId: ctx.proveedorId,
      hubId:       vecino.hubId,
      estado:      "aceptacion",
      total,
      items: {
        create: carrito.map(i => ({
          productoId: i.productoId,
          cantidad:   i.cantidad,
          precioUnit: i.precioUnit,
        })),
      },
    },
  });

  return ok("start", {}, [{
    tipo:  "texto",
    texto: `✅ ${bold("¡Pedido #" + pedido.id + " registrado!")}\n\nTotal base: ${bold(pesos(total))}\n\nCuando el proveedor cierre la ronda recibirás los descuentos acreditados en tu cuenta corriente.\n\nEscribí ${bold("menu")} para volver.`,
  }]);
}

// ─── SERVICIOS — JardinerosYA / FumigadoresYA ─────────────────────────────────

async function flujoServicio(sesion, input, stepOrId, ctx) {
  const tel = sesion.telefono;
  const id  = btnId(input) || stepOrId;
  const val = txt(input);

  // ── Menú de servicios ────────────────────────────────────
  if (stepOrId === "srv_menu") {
    return ok("srv_menu", ctx, [{
      tipo:    "botones",
      texto:   `🛠️ ${bold("Servicios para tu hogar")}\n\n¿Qué necesitás?`,
      botones: [
        { id: "srv_tipo_jardineros",  label: "🌿 JardinerosYA"  },
        { id: "srv_tipo_fumigadores", label: "🐛 FumigadoresYA"  },
        { id: "start",                label: "⬅️ Volver"         },
      ],
    }]);
  }

  // ── Selección de tipo ────────────────────────────────────
  if (id === "srv_tipo_jardineros" || id === "srv_tipo_fumigadores") {
    const tipo      = id.replace("srv_tipo_", "");
    const tipoLabel = tipo === "jardineros" ? "🌿 JardinerosYA" : "🐛 FumigadoresYA";

    return ok("srv_descripcion", { ...ctx, servicioTipo: tipo }, [{
      tipo:  "texto",
      texto: `${tipoLabel}\n\nDescribí brevemente lo que necesitás:\n${italic('(ej: "jardín de 50m², corte y bordes")')}`,
    }]);
  }

  // ── Descripción del trabajo ──────────────────────────────
  if (stepOrId === "srv_descripcion") {
    if (!val || val.length < 5) {
      return ok("srv_descripcion", ctx, [{
        tipo:  "texto",
        texto: "Por favor describí un poco más lo que necesitás (mínimo 5 caracteres).",
      }]);
    }

    const tipoLabel = ctx.servicioTipo === "jardineros" ? "🌿 JardinerosYA" : "🐛 FumigadoresYA";
    return ok("srv_confirmar", { ...ctx, descripcion: val }, [{
      tipo:    "botones",
      texto:   `📋 ${bold("¿Confirmás tu solicitud?")}\n\nServicio: ${bold(tipoLabel)}\nDescripción: ${italic(val)}\n\nUn proveedor de tu hub te contactará.`,
      botones: [
        { id: "srv_enviar",  label: "✅ Confirmar"   },
        { id: "srv_menu",    label: "✏️ Modificar"   },
      ],
    }]);
  }

  // ── Enviar solicitud (vínculo doble) ─────────────────────
  if (id === "srv_enviar") {
    const vecino = await db.getVecino(tel);

    const solicitud = await db.crearSolicitud({
      tipo:           ctx.servicioTipo,
      telefonoVecino: tel,
      nombreVecino:   vecino?.nombre || "Vecino",
      descripcion:    ctx.descripcion,
      hubId:          vecino?.hubId || null,
      lat:            vecino?.lat   || null,
      lng:            vecino?.lng   || null,
      estado:         "pendiente",
    });

    // Vínculo doble: notificar a todos los proveedores del hub del vecino
    const notificaciones = [];
    if (vecino?.hubId) {
      const hps = await prisma.hubProveedor.findMany({
        where:   { hubId: vecino.hubId, activo: true },
        include: { proveedor: true },
      });
      const tipoLabel = ctx.servicioTipo === "jardineros" ? "JardinerosYA 🌿" : "FumigadoresYA 🐛";
      for (const hp of hps) {
        if (hp.proveedor.telefono) {
          notificaciones.push({
            destinatario: hp.proveedor.telefono,
            mensaje:      `🔔 ${bold("Nueva solicitud " + tipoLabel + " #" + solicitud.id)}\n\n👤 Vecino: ${vecino.nombre}\n📝 ${ctx.descripcion}\n\nRespondé desde tu panel: ${bold("menu")}`,
          });
        }
      }
    }

    return ok("start", {}, [{
      tipo:  "texto",
      texto: `✅ ${bold("¡Solicitud enviada!")}\n\nServicio: ${ctx.servicioTipo === "jardineros" ? "🌿 JardinerosYA" : "🐛 FumigadoresYA"}\nID: #${solicitud.id}\n\nTe avisamos cuando un proveedor acepte. 🙌`,
    }], notificaciones.length ? notificaciones : null);
  }

  return flujoServicio(sesion, input, "srv_menu", ctx);
}

// ─── MI HUB — INFO Y VOTACIONES ──────────────────────────────────────────────

async function flujoHub(sesion, input, stepOrId, ctx) {
  const tel = sesion.telefono;
  const id  = btnId(input) || stepOrId;
  const val = txt(input);

  const vecino = await db.getVecino(tel);
  if (!vecino?.hubId) {
    return ok("start", {}, [{ tipo: "texto", texto: "No tenés un hub asignado. Completá tu registro primero." }]);
  }

  const hub         = await prisma.hub.findUnique({ where: { id: vecino.hubId } });
  const integrantes = await db.contarIntegrantesHub(vecino.hubId);

  // ── Panel del hub ────────────────────────────────────────
  if (stepOrId === "hub_inicio") {
    const botones = [{ id: "hub_info", label: "ℹ️ Info del hub" }];
    if (integrantes >= 5) {
      botones.push({ id: "hub_votar", label: "🗳️ Votaciones" });
    }
    botones.push({ id: "start", label: "⬅️ Volver" });

    return ok("hub_inicio", ctx, [{
      tipo:    "botones",
      texto:   `🏘️ ${bold(hub.nombre)}\n\n📍 ${hub.barrio}, ${hub.provincia}\n👥 ${integrantes} integrante${integrantes !== 1 ? "s" : ""}${integrantes < 5 ? `\n\n${italic("Las votaciones se habilitan con 5+ integrantes.")}` : ""}`,
      botones,
    }]);
  }

  // ── Info detallada ───────────────────────────────────────
  if (id === "hub_info") {
    const hps = await prisma.hubProveedor.findMany({
      where:   { hubId: vecino.hubId, activo: true },
      include: { proveedor: true },
    });
    const provLista = hps.length
      ? hps.map(hp => `• ${hp.proveedor.negocio}${hp.diaReparto ? " · " + hp.diaReparto : ""}`).join("\n")
      : "Ninguno aún";

    return ok("hub_inicio", ctx, [{
      tipo:  "texto",
      texto: `🏘️ ${bold(hub.nombre)}\n\n📍 ${hub.barrio}, ${hub.provincia}\n👥 ${integrantes} integrante${integrantes !== 1 ? "s" : ""}\n\n${bold("Proveedores activos:")}\n${provLista}\n\nEscribí ${bold("menu")} para volver.`,
    }]);
  }

  // ── Votaciones ───────────────────────────────────────────
  if (id === "hub_votar") {
    if (integrantes < 5) {
      return ok("hub_inicio", ctx, [{
        tipo:  "texto",
        texto: `Se necesitan al menos 5 integrantes para votar. Actualmente hay ${integrantes}.`,
      }]);
    }

    const propuestas = await db.getPropuestasHub(vecino.hubId);

    if (!propuestas.length) {
      return ok("hub_inicio", ctx, [{
        tipo:    "botones",
        texto:   `🗳️ ${bold("Votaciones del Hub")}\n\nNo hay propuestas activas.\n\n¿Querés crear una?`,
        botones: [
          { id: "hub_nueva_propuesta", label: "➕ Nueva propuesta" },
          { id: "hub_inicio",          label: "⬅️ Volver"          },
        ],
      }]);
    }

    return ok("hub_votar", ctx, [{
      tipo:       "lista",
      texto:      `🗳️ ${bold("Propuestas activas")} — elegí para votar:`,
      botonLista: "Ver propuestas",
      secciones:  [{
        titulo: "Propuestas",
        items:  propuestas.map(p => ({
          id:          `hub_prop_${encodeURIComponent(p.propuesta)}`,
          titulo:      p.propuesta,
          descripcion: `${p._count.opcion} voto${p._count.opcion !== 1 ? "s" : ""}`,
        })),
      }],
    }]);
  }

  // ── Nueva propuesta: pedir texto ─────────────────────────
  if (id === "hub_nueva_propuesta") {
    return ok("hub_escribir_propuesta", ctx, [{
      tipo:  "texto",
      texto: `🗳️ ${bold("Nueva propuesta")}\n\nEscribí el texto de tu propuesta:`,
    }]);
  }

  if (stepOrId === "hub_escribir_propuesta") {
    if (!val || val.length < 5) {
      return ok("hub_escribir_propuesta", ctx, [{
        tipo:  "texto",
        texto: "La propuesta debe tener al menos 5 caracteres.",
      }]);
    }
    return ok("hub_opcion_voto", { ...ctx, propuesta: val }, [{
      tipo:    "botones",
      texto:   `🗳️ Propuesta: "${bold(val)}"\n\n¿Cómo votás?`,
      botones: [
        { id: "hub_voto_si",         label: "✅ Sí"          },
        { id: "hub_voto_no",         label: "❌ No"           },
        { id: "hub_voto_abstencion", label: "🤷 Abstención"  },
      ],
    }]);
  }

  // ── Ver propuesta existente y votar ──────────────────────
  if (id.startsWith("hub_prop_")) {
    const propuesta = decodeURIComponent(id.replace("hub_prop_", ""));
    const votos     = await db.getVotosPropuesta(vecino.hubId, propuesta);
    const siCnt     = votos.filter(v => v.opcion === "si").length;
    const noCnt     = votos.filter(v => v.opcion === "no").length;
    const absCnt    = votos.filter(v => v.opcion === "abstencion").length;
    const yaVote    = votos.some(v => v.telefono === tel);

    if (yaVote) {
      return ok("hub_votar", ctx, [{
        tipo:  "texto",
        texto: `🗳️ ${bold(propuesta)}\n\nResultados:\n✅ Sí: ${siCnt}\n❌ No: ${noCnt}\n🤷 Abstención: ${absCnt}\n\n${italic("Ya votaste en esta propuesta.")}`,
      }]);
    }

    return ok("hub_opcion_voto", { ...ctx, propuesta }, [{
      tipo:    "botones",
      texto:   `🗳️ ${bold(propuesta)}\n\nResultados actuales:\n✅ ${siCnt} · ❌ ${noCnt} · 🤷 ${absCnt}\n\n¿Cómo votás?`,
      botones: [
        { id: "hub_voto_si",         label: "✅ Sí"          },
        { id: "hub_voto_no",         label: "❌ No"           },
        { id: "hub_voto_abstencion", label: "🤷 Abstención"  },
      ],
    }]);
  }

  // ── Registrar voto ───────────────────────────────────────
  if (id === "hub_voto_si" || id === "hub_voto_no" || id === "hub_voto_abstencion") {
    const opcionMap = { hub_voto_si: "si", hub_voto_no: "no", hub_voto_abstencion: "abstencion" };
    const opcion    = opcionMap[id];
    const propuesta = ctx.propuesta;

    if (!propuesta) return flujoHub(sesion, input, "hub_votar", ctx);

    await db.registrarVoto(vecino.hubId, tel, propuesta, opcion);

    const votos  = await db.getVotosPropuesta(vecino.hubId, propuesta);
    const siCnt  = votos.filter(v => v.opcion === "si").length;
    const noCnt  = votos.filter(v => v.opcion === "no").length;
    const absCnt = votos.filter(v => v.opcion === "abstencion").length;

    return ok("hub_inicio", {}, [{
      tipo:  "texto",
      texto: `🗳️ ${bold("¡Voto registrado!")}\n\n${bold(propuesta)}\n\nResultados:\n✅ Sí: ${siCnt}\n❌ No: ${noCnt}\n🤷 Abstención: ${absCnt}`,
    }]);
  }

  return flujoHub(sesion, input, "hub_inicio", ctx);
}

// ─── PANEL ADMIN / PROVEEDOR ──────────────────────────────────────────────────

async function flujoAdmin(sesion, input, stepOrId, ctx) {
  if (sesion.tipo !== "proveedor") return menuPrincipal(sesion);

  const provId = sesion.proveedorId;
  const id     = btnId(input) || stepOrId;
  const val    = txt(input);

  // ── Rondas activas ───────────────────────────────────────
  if (id === "adm_pedidos") {
    const pedidos = await db.pedidosRondaActiva(provId);

    if (!pedidos.length) {
      return ok("start", {}, [{
        tipo:  "texto",
        texto: "No hay pedidos pendientes en este momento.",
      }]);
    }

    // Hub del proveedor para calcular distancia
    const hpProv = await prisma.hubProveedor.findFirst({
      where:   { proveedorId: provId, activo: true },
      include: { hub: true },
    });
    const hubRef = hpProv?.hub;

    const resumen = pedidos.map(p => {
      let distInfo = "";
      if (hubRef?.lat && hubRef?.lng && p.hub?.lat && p.hub?.lng) {
        const dist = distanciaKm(hubRef.lat, hubRef.lng, p.hub.lat, p.hub.lng);
        distInfo   = ` · ${dist.toFixed(1)} km`;
      }
      const items = p.items.map(i => `${i.cantidad}× ${i.producto.nombre}`).join(", ");
      return `• #${p.id} — ${p.cliente.nombre} (${p.hub?.nombre || "—"}${distInfo})\n  ${items} — ${pesos(p.total)}`;
    }).join("\n\n");

    return ok("adm_ver_pedidos", { totalPedidos: pedidos.length }, [{
      tipo:    "botones",
      texto:   `📋 ${bold("Rondas activas")} — ${pedidos.length} pedido${pedidos.length !== 1 ? "s" : ""}\n\n${resumen}`,
      botones: [
        { id: "adm_cerrar_ronda", label: "✅ Cerrar ronda"    },
        { id: "start",            label: "⬅️ Volver"           },
      ],
    }]);
  }

  // ── Confirmar cierre de ronda ────────────────────────────
  if (id === "adm_cerrar_ronda") {
    return ok("adm_confirmar_cierre", ctx, [{
      tipo:    "botones",
      texto:   `⚠️ ${bold("¿Cerrás la ronda?")}\n\nSe aprobarán todos los pedidos pendientes y se acreditarán los descuentos por volumen en las cuentas corrientes de los vecinos.`,
      botones: [
        { id: "adm_confirmar_si", label: "✅ Sí, cerrar ronda" },
        { id: "adm_pedidos",      label: "← Volver"            },
      ],
    }]);
  }

  if (id === "adm_confirmar_si") {
    const cantidad = await db.cerrarRonda(provId);
    return ok("start", {}, [{
      tipo:  "texto",
      texto: `✅ ${bold("¡Ronda cerrada!")}\n\n${cantidad} pedido${cantidad !== 1 ? "s" : ""} aprobado${cantidad !== 1 ? "s" : ""}. Los descuentos por volumen se acreditaron en las cuentas corrientes de cada vecino.`,
    }]);
  }

  // ── Solicitudes de servicio ──────────────────────────────
  if (id === "adm_servicios") {
    const solicitudes = await db.getSolicitudesPendientes(10);

    if (!solicitudes.length) {
      return ok("start", {}, [{
        tipo:  "texto",
        texto: "No hay solicitudes de servicio pendientes.",
      }]);
    }

    // Hub ref para calcular distancias
    const hpProv = await prisma.hubProveedor.findFirst({
      where:   { proveedorId: provId, activo: true },
      include: { hub: true },
    });
    const hubRef = hpProv?.hub;

    return ok("adm_ver_solicitudes", ctx, [{
      tipo:       "lista",
      texto:      `🛠️ ${bold("Solicitudes pendientes")} (${solicitudes.length})`,
      botonLista: "Ver solicitudes",
      secciones:  [{
        titulo: "Solicitudes",
        items:  solicitudes.map(s => {
          let distInfo = "";
          if (hubRef?.lat && hubRef?.lng && s.lat && s.lng) {
            const dist = distanciaKm(hubRef.lat, hubRef.lng, s.lat, s.lng);
            distInfo   = ` · ${dist.toFixed(1)} km`;
          }
          const emoji = s.tipo === "jardineros" ? "🌿" : "🐛";
          return {
            id:          `adm_sol_${s.id}`,
            titulo:      `${emoji} ${s.nombreVecino}${distInfo}`,
            descripcion: (s.descripcion || "Sin descripción").slice(0, 50),
          };
        }),
      }],
    }]);
  }

  // ── Detalle de solicitud ─────────────────────────────────
  if (id.startsWith("adm_sol_")) {
    const solId = parseInt(id.replace("adm_sol_", ""), 10);
    if (!solId) return flujoAdmin(sesion, input, "adm_servicios", ctx);

    const sol = await db.getSolicitudPendiente(solId);
    if (!sol) return ok("adm_servicios", {}, [{ tipo: "texto", texto: "Solicitud no encontrada." }]);

    // Distancia
    const hpProv = await prisma.hubProveedor.findFirst({
      where:   { proveedorId: provId, activo: true },
      include: { hub: true },
    });
    let distTexto = "";
    if (hpProv?.hub?.lat && hpProv?.hub?.lng && sol.lat && sol.lng) {
      const dist = distanciaKm(hpProv.hub.lat, hpProv.hub.lng, sol.lat, sol.lng);
      distTexto  = `\n📍 Distancia estimada: ${bold(dist.toFixed(2) + " km")}`;
    }

    const emoji = sol.tipo === "jardineros" ? "🌿 JardinerosYA" : "🐛 FumigadoresYA";
    return ok("adm_responder_sol", { ...ctx, solId }, [{
      tipo:    "botones",
      texto:   `🛠️ ${bold("Solicitud #" + sol.id)} — ${emoji}\n\n👤 Vecino: ${sol.nombreVecino}\n🏘️ Hub: ${sol.hub?.nombre || "—"}\n📝 ${sol.descripcion || "Sin descripción"}${distTexto}`,
      botones: [
        { id: "adm_aceptar_sol",  label: "✅ Aceptar solicitud"  },
        { id: "adm_rechazar_sol", label: "❌ Rechazar solicitud"  },
        { id: "adm_servicios",    label: "⬅️ Volver"              },
      ],
    }]);
  }

  // ── Responder solicitud ──────────────────────────────────
  if (id === "adm_aceptar_sol" || id === "adm_rechazar_sol") {
    const aceptar     = id === "adm_aceptar_sol";
    const nuevoEstado = aceptar ? "asignado" : "cancelado";
    const solId       = ctx.solId;

    if (!solId) return flujoAdmin(sesion, input, "adm_servicios", ctx);

    const sol = await db.getSolicitudPendiente(solId);
    await db.actualizarSolicitud(solId, {
      estado:      nuevoEstado,
      proveedorId: aceptar ? provId : null,
    });

    // Notificar al vecino
    const notificaciones = sol ? [{
      destinatario: sol.telefonoVecino,
      mensaje:      aceptar
        ? `✅ ${bold("¡Tu solicitud fue aceptada!")}\n\nServicio: ${sol.tipo === "jardineros" ? "🌿 JardinerosYA" : "🐛 FumigadoresYA"}\n\nEl proveedor se contactará con vos para coordinar.`
        : `ℹ️ Tu solicitud #${solId} fue cancelada por el proveedor. Podés enviar una nueva desde el menú.`,
    }] : null;

    return ok("start", {}, [{
      tipo:  "texto",
      texto: `${aceptar ? "✅" : "❌"} Solicitud #${solId} ${aceptar ? "aceptada" : "rechazada"}.`,
    }], notificaciones);
  }

  // ── Caja del día ─────────────────────────────────────────
  if (id === "adm_caja") {
    const movs   = await db.getMovCaja(provId, 10);
    const total  = movs.reduce((s, m) => s + m.monto, 0);
    const lista  = movs.length
      ? movs.map(m => `• ${m.tipo} — ${pesos(m.monto)} — ${italic(m.descripcion)}`).join("\n")
      : "Sin movimientos";

    return ok("start", {}, [{
      tipo:  "texto",
      texto: `💰 ${bold("Caja del día")}\n\n${lista}\n\n${bold("Saldo: " + pesos(total))}`,
    }]);
  }

  return menuPrincipal(sesion);
}
