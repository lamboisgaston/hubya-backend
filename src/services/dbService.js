// src/services/dbService.js
// Capa de acceso a datos — wrapper sobre Prisma

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ── PROVEEDORES ──────────────────────────────────────────
exports.getProveedor = (id) =>
  prisma.proveedor.findUnique({ where: { id } });

exports.getProveedorByTel = (telefono) =>
  prisma.proveedor.findUnique({ where: { telefono } });

// ── PEDIDOS ──────────────────────────────────────────────
exports.pedidosPorEstado = (proveedorId, estado) =>
  prisma.pedido.findMany({
    where: { proveedorId, estado },
    include: {
      cliente: true,
      hub:     true,
      items:   { include: { producto: true } },
    },
    orderBy: { createdAt: "desc" },
  });

exports.aceptarTodosPedidos = async (proveedorId) => {
  await prisma.pedido.updateMany({
    where:  { proveedorId, estado: "aceptacion" },
    data:   { estado: "aceptado" },
  });
};

exports.cambiarEstadoPedido = (pedidoId, estado) =>
  prisma.pedido.update({ where: { id: pedidoId }, data: { estado } });

// ── CLIENTES ─────────────────────────────────────────────
exports.getClientes = (proveedorId) =>
  prisma.cliente.findMany({
    where:   { proveedorId },
    include: { hub: true },
    orderBy: { nombre: "asc" },
  });

exports.getClienteByTel = (telefono, proveedorId) =>
  prisma.cliente.findUnique({ where: { telefono_proveedorId: { telefono, proveedorId } } });

exports.updateLimiteCliente = (clienteId, limite) =>
  prisma.cliente.update({ where: { id: clienteId }, data: { limite } });

exports.updateSaldoCliente = (clienteId, delta) =>
  prisma.cliente.update({
    where: { id: clienteId },
    data:  { saldo: { increment: delta } },
  });

// ── PRODUCTOS ─────────────────────────────────────────────
exports.getProductos = (proveedorId) =>
  prisma.producto.findMany({
    where:   { proveedorId, activo: true },
    include: { categoria: true, subcategoria: true, descuentos: { orderBy: { desde: "asc" } } },
    orderBy: { nombre: "asc" },
  });

exports.getProducto = (id) =>
  prisma.producto.findUnique({
    where:   { id },
    include: { descuentos: { orderBy: { desde: "asc" } } },
  });

exports.setDescuentos = async (productoId, descuentos) => {
  await prisma.descuento.deleteMany({ where: { productoId } });
  if (descuentos.length) {
    await prisma.descuento.createMany({
      data: descuentos.map(d => ({ productoId, desde: d.desde, hasta: d.hasta, porcentaje: d.porcentaje })),
    });
  }
};

// Calcular precio con descuento según cantidad
exports.calcularPrecio = (producto, cantidad) => {
  const desc = producto.descuentos
    .filter(d => cantidad >= d.desde && cantidad <= d.hasta)
    .sort((a, b) => b.desde - a.desde)[0];
  if (!desc) return producto.precioBase;
  return Math.round(producto.precioBase * (1 - desc.porcentaje / 100));
};

// ── CAJA ─────────────────────────────────────────────────
exports.getMovCaja = (proveedorId, limit = 20) =>
  prisma.movCaja.findMany({
    where:   { proveedorId },
    orderBy: { createdAt: "desc" },
    take:    limit,
  });

exports.agregarMovCaja = (proveedorId, data) =>
  prisma.movCaja.create({ data: { proveedorId, ...data } });

// ── SALDO ─────────────────────────────────────────────────
exports.getMovSaldo = (proveedorId) =>
  prisma.movSaldo.findMany({
    where:   { proveedorId },
    orderBy: { createdAt: "desc" },
  });

exports.agregarMovSaldo = (proveedorId, data) =>
  prisma.movSaldo.create({ data: { proveedorId, ...data } });

// ── VENTAS ───────────────────────────────────────────────
exports.crearVenta = async (proveedorId, { clienteId, telefono, medio, items }) => {
  const total = items.reduce((s, i) => s + i.precioUnit * i.cantidad, 0);
  const venta = await prisma.venta.create({
    data: {
      proveedorId,
      clienteId: clienteId || null,
      telefono:  telefono  || null,
      medio,
      total,
      cobrado: total,
      items: { create: items },
    },
  });
  // Registrar en caja
  await exports.agregarMovCaja(proveedorId, {
    tipo: "venta", descripcion: "Venta al público",
    monto: total, medio, tieneFactura: false,
    refId: venta.id, refTipo: "venta",
  });
  // Registrar en haber del saldo
  await exports.agregarMovSaldo(proveedorId, {
    lado: "H", descripcion: "Venta al público",
    monto: total, refId: venta.id, refTipo: "venta",
  });
  return venta;
};

// ── CATEGORÍAS ───────────────────────────────────────────
exports.getCategorias = (proveedorId) =>
  prisma.categoria.findMany({
    where:   { proveedorId },
    include: { subcategorias: true },
    orderBy: { orden: "asc" },
  });

// ── HUBS ─────────────────────────────────────────────────
exports.getHubsProveedor = (proveedorId) =>
  prisma.hubProveedor.findMany({
    where:   { proveedorId },
    include: { hub: true },
  });

// ── VENCIMIENTOS ─────────────────────────────────────────
exports.clientesVencidos = async (proveedorId) => {
  const hoy    = new Date();
  const clientes = await exports.getClientes(proveedorId);
  return clientes.filter(c => c.saldo < 0); // en producción filtraría por fecha de vencimiento
};
