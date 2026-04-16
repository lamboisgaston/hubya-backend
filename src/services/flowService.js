// src/services/flowService.js
// Motor de conversación: dado el step actual + input del usuario,
// devuelve los mensajes a enviar y el nuevo estado de la sesión.

const db     = require("./dbService");
const fmt    = require("../utils/format");

// ── Entrada principal ────────────────────────────────────
exports.procesar = async (sesion, input) => {
  const { step, ctx, proveedorId } = sesion;

  // Comandos globales
  if (input.valor === "reiniciar" || input.valor?.toLowerCase() === "menu") {
    return irA("start", {}, await stepStart(proveedorId));
  }

  // Resolver step actual
  const handler = STEPS[step];
  if (!handler) {
    return irA("start", {}, await stepStart(proveedorId));
  }

  return handler({ ctx, input, proveedorId });
};

// ── Helper para construir respuesta ─────────────────────
function irA(step, ctx, mensajes) {
  return { nuevoStep: step, nuevoCtx: ctx, mensajes };
}

// ── Construir mensaje con botones desde opts ─────────────
function msgConBotones(texto, opts) {
  // Si hay más de 10 opciones usar lista; si ≤3 usar botones
  if (opts.length <= 3) {
    return [{
      tipo: "botones",
      texto,
      botones: opts.map(o => ({ id: o.n + (o.m ? "|" + JSON.stringify(o.m) : ""), label: o.l.slice(0,20) })),
    }];
  }
  // Lista
  return [{
    tipo: "lista",
    header: "HubYa",
    texto,
    secciones: [{ title: "Opciones", rows: opts.map(o => ({ id: o.n + (o.m ? "|" + JSON.stringify(o.m) : ""), title: o.l.slice(0,24) })) }],
  }];
}

// Parsear id del botón/lista → {step, ctx}
function parsearId(id) {
  const idx = id.indexOf("|");
  if (idx < 0) return { step: id, extra: {} };
  try {
    return { step: id.slice(0, idx), extra: JSON.parse(id.slice(idx + 1)) };
  } catch {
    return { step: id, extra: {} };
  }
}

// ── PASO: menú principal ─────────────────────────────────
async function stepStart(proveedorId) {
  const prov    = await db.getProveedor(proveedorId);
  const xAcept  = await db.pedidosPorEstado(proveedorId, "aceptacion");
  const texto   = `🧑‍🌾 *${prov?.negocio || "HubYa"}*\n_Panel de proveedor_\n\n${xAcept.length > 0 ? `📥 Tenés *${xAcept.length} pedidos* sin aceptar.\n\n` : ""}¿Qué querés gestionar?`;
  const opts    = [
    { l: `📦 Pedidos${xAcept.length ? ` (${xAcept.length})` : ""}`, n: "pedidos" },
    { l: "💰 Saldos de clientes",  n: "clientes"  },
    { l: "💼 Mi saldo",            n: "mi_saldo"   },
    { l: "💵 Mi caja",             n: "mi_caja"    },
    { l: "📣 Avisar vencimientos", n: "avisos"     },
    { l: "🗺️ Ruta de entrega",     n: "ruta"       },
    { l: "📦 Mis productos",       n: "productos"  },
    { l: "🛒 Venta al público",    n: "venta_tel"  },
    { l: "🏘️ Mis hubs",            n: "hubs"       },
  ];
  return msgConBotones(texto, opts);
}

// ── STEPS ────────────────────────────────────────────────
const STEPS = {

  // Menú principal
  start: async ({ proveedorId }) => {
    return irA("start", {}, await stepStart(proveedorId));
  },

  // ── PEDIDOS ──
  pedidos: async ({ ctx, proveedorId }) => {
    const xA = await db.pedidosPorEstado(proveedorId, "aceptacion");
    const xE = await db.pedidosPorEstado(proveedorId, "aceptado");
    const texto = `📦 *Pedidos*\n\n⏳ *Sin aceptar:* ${xA.length}\n📦 *Aceptados — sin reparto:* ${xE.length}\n\n¿Qué querés ver?`;
    const opts  = [
      ...(xA.length ? [{ l: `⏳ Aceptación de pedidos (${xA.length})`, n: "pedidos_aceptar" }] : []),
      ...(xE.length ? [{ l: `📦 Aceptados — sin reparto (${xE.length})`, n: "pedidos_aceptados" }] : []),
      { l: "⬅️ Menú",  n: "start" },
    ];
    return irA("pedidos", {}, msgConBotones(texto, opts));
  },

  pedidos_aceptar: async ({ proveedorId }) => {
    const lista  = await db.pedidosPorEstado(proveedorId, "aceptacion");
    const resumen = lista.map(p => `• ${p.cliente.nombre} — ${p.items.map(i => `${i.producto.nombre} ×${i.cantidad}`).join(", ")} — ${fmt.pesos(p.total)}`).join("\n");
    const texto  = `⏳ *Pedidos sin aceptar (${lista.length}):*\n\n${resumen}\n\n¿Aceptás todos?`;
    const opts   = [
      { l: "✅ Aceptar todos",   n: "pedidos_aceptar_ok" },
      { l: "❌ Rechazar uno",    n: "pedidos_rechazar"    },
      { l: "⬅️ Volver",        n: "pedidos"              },
    ];
    return irA("pedidos_aceptar", {}, msgConBotones(texto, opts));
  },

  pedidos_aceptar_ok: async ({ proveedorId }) => {
    await db.aceptarTodosPedidos(proveedorId);
    const texto = `✅ *Pedidos aceptados.* Pasan a la cola de entrega.`;
    return irA("start", {}, [{ tipo: "texto", texto }, ...(await stepStart(proveedorId))]);
  },

  // ── CLIENTES ──
  clientes: async ({ proveedorId }) => {
    const lista   = await db.getClientes(proveedorId);
    const neg     = lista.filter(c => c.saldo < 0).length;
    const cero    = lista.filter(c => c.saldo === 0).length;
    const texto   = `👥 *Saldos de clientes*\n\n🔴 Con deuda: *${neg}*\n✅ Al día: *${cero}*\n\n¿Qué querés ver?`;
    const opts    = [
      { l: `👥 Todos (${lista.length})`,         n: "cli_todos"    },
      { l: `🔴 Con deuda (${neg})`,               n: "cli_deuda"    },
      { l: "✏️ Cambiar límite",                   n: "cli_limite"   },
      { l: "⬅️ Menú",                            n: "start"         },
    ];
    return irA("clientes", {}, msgConBotones(texto, opts));
  },

  // ── MI CAJA ──
  mi_caja: async ({ proveedorId }) => {
    const movs    = await db.getMovCaja(proveedorId, 10);
    const ent     = movs.filter(m => m.monto > 0).reduce((s, m) => s + m.monto, 0);
    const sal     = movs.filter(m => m.monto < 0).reduce((s, m) => s + m.monto, 0);
    const ef      = movs.filter(m => m.medio === "efectivo").reduce((s, m) => s + m.monto, 0);
    const bco     = movs.filter(m => m.medio === "banco").reduce((s, m) => s + m.monto, 0);
    const total   = ent + sal;
    const texto   = `💵 *Mi caja*\n\n${movs.map(m => `${m.monto > 0 ? "💵" : "💸"} ${m.descripcion} — ${m.monto > 0 ? "+" : ""}${fmt.pesos(m.monto)}`).join("\n")}\n\n💵 Entró: *${fmt.pesos(ent)}*\n💸 Salió: *${fmt.pesos(sal)}*\n\n${total >= 0 ? "✅" : "⚠️"} *Total: ${fmt.pesos(total)}*\n💵 Efectivo: ${fmt.pesos(ef)}\n🏦 Banco: ${fmt.pesos(bco)}`;
    const opts    = [
      { l: "💸 Pagar a proveedor", n: "caja_pago_prov" },
      { l: "⬅️ Menú",             n: "start"           },
    ];
    return irA("mi_caja", {}, msgConBotones(texto, opts));
  },

  // ── CAJA: pago a proveedor ──
  caja_pago_prov: async () => {
    return irA("caja_pago_prov", {}, msgConBotones(
      "💸 *Pago a proveedor*\n\n¿A quién le pagás?",
      [
        { l: "🥩 Mercadería",   n: "caja_pago_medio", m: { pagoProveedor: "Mercadería"   } },
        { l: "🚚 Flete",        n: "caja_pago_medio", m: { pagoProveedor: "Flete"         } },
        { l: "📦 Insumos",      n: "caja_pago_medio", m: { pagoProveedor: "Insumos"       } },
        { l: "🔧 Servicio",     n: "caja_pago_medio", m: { pagoProveedor: "Servicio"      } },
        { l: "✏️ Otro",         n: "caja_pago_medio", m: { pagoProveedor: "Varios"        } },
        { l: "⬅️ Volver",      n: "mi_caja"                                                 },
      ]
    ));
  },

  caja_pago_medio: async ({ ctx, input }) => {
    const { step: targetStep, extra } = parsearId(input.valor);
    const nuevoCtx = { ...ctx, ...extra };
    return irA("caja_pago_monto", nuevoCtx, msgConBotones(
      `💸 *${nuevoCtx.pagoProveedor}*\n\n¿Cómo pagás?`,
      [
        { l: "💵 Efectivo",        n: "caja_pago_monto", m: { pagoMedio: "efectivo" } },
        { l: "🏦 Transferencia",   n: "caja_pago_monto", m: { pagoMedio: "banco"    } },
        { l: "⬅️ Volver",         n: "caja_pago_prov"                                 },
      ]
    ));
  },

  caja_pago_monto: async ({ ctx, input }) => {
    const { extra } = parsearId(input.valor);
    const nuevoCtx  = { ...ctx, ...extra };
    return irA("caja_pago_factura", nuevoCtx, msgConBotones(
      `💸 *${nuevoCtx.pagoProveedor}* — ${nuevoCtx.pagoMedio === "efectivo" ? "💵 Efectivo" : "🏦 Banco"}\n\n¿Cuánto pagás?`,
      [5000, 10000, 20000, 30000, 50000].map(m => ({
        l: `💸 ${fmt.pesos(m)}`, n: "caja_pago_factura", m: { pagoMonto: m },
      })).concat([{ l: "✏️ Otro monto", n: "caja_pago_factura_txt" }])
    ));
  },

  caja_pago_factura: async ({ ctx, input }) => {
    const { extra } = parsearId(input.valor);
    const nuevoCtx  = { ...ctx, ...extra };
    return irA("caja_pago_confirmar", nuevoCtx, msgConBotones(
      `🧾 *Adjuntar factura*\n\n${nuevoCtx.pagoProveedor} · ${fmt.pesos(nuevoCtx.pagoMonto || 0)}\n\nPara registrar correctamente adjuntá la foto o PDF en el chat.\n\nTambién podés confirmar sin factura, pero te lo recordamos.`,
      [
        { l: "✅ Confirmar con factura", n: "caja_pago_ok", m: { pagoTieneFactura: true  } },
        { l: "⚠️ Sin factura por ahora", n: "caja_pago_ok", m: { pagoTieneFactura: false } },
        { l: "⬅️ Cancelar",             n: "mi_caja"                                       },
      ]
    ));
  },

  caja_pago_ok: async ({ ctx, input, proveedorId }) => {
    const { extra } = parsearId(input.valor);
    const nuevoCtx  = { ...ctx, ...extra };

    // Guardar en DB
    await db.agregarMovCaja(proveedorId, {
      tipo:         "pago_proveedor",
      descripcion:  `Pago ${nuevoCtx.pagoProveedor}`,
      monto:        -(nuevoCtx.pagoMonto || 0),
      medio:        nuevoCtx.pagoMedio || "banco",
      tieneFactura: nuevoCtx.pagoTieneFactura || false,
    });

    const fac   = nuevoCtx.pagoTieneFactura
      ? "✅ Factura registrada."
      : "⚠️ *Sin factura.* Recordá cargarla para tener el registro completo.";
    const texto = `✅ *Pago registrado.*\n\n${nuevoCtx.pagoProveedor} — ${fmt.pesos(nuevoCtx.pagoMonto || 0)}\n${nuevoCtx.pagoMedio === "efectivo" ? "💵 Sale de efectivo" : "🏦 Sale del banco"}\n\n${fac}`;

    return irA("start", {}, [{ tipo: "texto", texto }, ...(await stepStart(proveedorId))]);
  },

};

// ── Fallback para steps no implementados aún ────────────
const handler = exports.procesar;
const originalProcesar = exports.procesar.bind({});
exports.procesar = async (sesion, input) => {
  // Si viene de un botón/lista, extraer el step destino del id
  if (input.tipo === "boton" || input.tipo === "lista") {
    const { step: targetStep, extra } = parsearId(input.valor || "");
    const nuevoCtx = { ...sesion.ctx, ...extra };
    sesion.step = targetStep;
    sesion.ctx  = nuevoCtx;
  }

  const stepFn = STEPS[sesion.step];
  if (stepFn) {
    return stepFn({ ctx: sesion.ctx, input, proveedorId: sesion.proveedorId });
  }

  // Step desconocido → ir al inicio
  return irA("start", {}, await stepStart(sesion.proveedorId));
};
