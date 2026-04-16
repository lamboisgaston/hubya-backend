// scripts/seed.js
// Carga datos iniciales para empezar a probar

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Cargando datos iniciales...");

  // ── Proveedor ──────────────────────────────────────────
  const proveedor = await prisma.proveedor.upsert({
    where:  { telefono: "5491112345678" },
    update: {},
    create: {
      nombre:   "Carlos Pérez",
      negocio:  "Granja San Martín",
      telefono: "5491112345678",  // +54 9 11 1234-5678 sin + ni espacios
    },
  });
  console.log("✅ Proveedor:", proveedor.negocio);

  // ── Hubs ───────────────────────────────────────────────
  const hubs = await Promise.all([
    prisma.hub.upsert({ where:{id:1}, update:{}, create:{ nombre:"El Prado",   barrio:"El Prado",   provincia:"Salta" }}),
    prisma.hub.upsert({ where:{id:2}, update:{}, create:{ nombre:"El Tipal",   barrio:"El Tipal",   provincia:"Salta" }}),
    prisma.hub.upsert({ where:{id:3}, update:{}, create:{ nombre:"Praderas",   barrio:"Praderas",   provincia:"Salta" }}),
  ]);
  console.log("✅ Hubs:", hubs.length);

  // Vincular proveedor a hubs
  for (const hub of hubs) {
    await prisma.hubProveedor.upsert({
      where:  { hubId_proveedorId: { hubId: hub.id, proveedorId: proveedor.id } },
      update: {},
      create: { hubId: hub.id, proveedorId: proveedor.id, activo: true },
    });
  }

  // ── Categorías y subcategorías ─────────────────────────
  const catData = [
    { nombre:"Herramientas", emoji:"🔧", subs:["Herramientas manuales","Herramientas eléctricas","Equipos de riego","Seguridad y EPP"] },
    { nombre:"Agroquímicos",  emoji:"🧪", subs:["Herbicidas","Fungicidas","Insecticidas","Fertilizantes"] },
    { nombre:"Semillas",      emoji:"🌱", subs:["Hortalizas","Cereales y gramíneas","Forrajeras y pasturas","Flores y ornamentales"] },
  ];
  const categorias = [];
  for (const [i, cd] of catData.entries()) {
    const cat = await prisma.categoria.upsert({
      where:  { id: i + 1 },
      update: {},
      create: { nombre: cd.nombre, emoji: cd.emoji, proveedorId: proveedor.id, orden: i },
    });
    for (const [j, subNombre] of cd.subs.entries()) {
      await prisma.subcategoria.upsert({
        where:  { id: i * 10 + j + 1 },
        update: {},
        create: { nombre: subNombre, categoriaId: cat.id, orden: j },
      });
    }
    categorias.push(cat);
  }
  console.log("✅ Categorías:", categorias.length);

  // ── Productos ejemplo ──────────────────────────────────
  const prod1 = await prisma.producto.upsert({
    where:  { id: 1 },
    update: {},
    create: {
      nombre:        "Producto 1",
      descripcion:   "Descripción del producto 1",
      categoriaId:   1,
      subcategoriaId:1,
      proveedorId:   proveedor.id,
      precioBase:    5500,
    },
  });
  await prisma.descuento.createMany({
    skipDuplicates: true,
    data: [
      { productoId: prod1.id, desde: 3, hasta: 5,  porcentaje: 7  },
      { productoId: prod1.id, desde: 6, hasta: 9,  porcentaje: 15 },
      { productoId: prod1.id, desde: 10,hasta: 999,porcentaje: 24 },
    ],
  });

  // ── Clientes ejemplo ───────────────────────────────────
  await prisma.cliente.upsert({
    where:  { telefono_proveedorId: { telefono:"5491155551001", proveedorId: proveedor.id } },
    update: {},
    create: { nombre:"María G.",  telefono:"5491155551001", hubId:1, proveedorId:proveedor.id, saldo:-3500,  limite:-10000 },
  });
  await prisma.cliente.upsert({
    where:  { telefono_proveedorId: { telefono:"5491155551006", proveedorId: proveedor.id } },
    update: {},
    create: { nombre:"Diego R.",  telefono:"5491155551006", hubId:2, proveedorId:proveedor.id, saldo:-10200, limite:-10000 },
  });

  console.log("✅ Seed completado.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
