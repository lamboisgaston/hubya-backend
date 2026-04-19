// scripts/seed.js — datos de prueba para HubYa
// Cubre: hubs en distintos estados, fundador, vecinos interesados, proveedor y offerings

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed...\n");

  // ── HUBS ───────────────────────────────────────────────
  // Hub activo: ya está operativo y acepta pedidos.
  const hubActivo = await prisma.hub.upsert({
    where: { slug: "palermo-soho" },
    update: {},
    create: {
      slug: "palermo-soho",
      name: "Palermo Soho",
      description: "Hub activo del barrio Palermo Soho, Buenos Aires.",
      address: "Palermo Soho, CABA",
      lat: -34.5875,
      lng: -58.4342,
      status: "active",
      timezone: "America/Argentina/Buenos_Aires",
    },
  });
  console.log("✅ Hub activo:", hubActivo.name);

  // Hub pendiente: fue fundado pero aún no llega a 5 interesados.
  const hubPendiente = await prisma.hub.upsert({
    where: { slug: "salta-capital-centro" },
    update: {},
    create: {
      slug: "salta-capital-centro",
      name: "Salta Capital Centro",
      description: "Hub en formación para el centro de Salta Capital.",
      address: "Salta Capital, Salta",
      lat: -24.7821,
      lng: -65.4232,
      status: "pending",
      refCode: "hub_SL4T4C3N",
      timezone: "America/Argentina/Salta",
    },
  });
  console.log("✅ Hub pendiente:", hubPendiente.name);

  // Hub rechazado: para poder probar ese caso borde.
  const hubRechazado = await prisma.hub.upsert({
    where: { slug: "hub-rechazado-test" },
    update: {},
    create: {
      slug: "hub-rechazado-test",
      name: "Hub Rechazado (Test)",
      description: "Hub rechazado por el admin para pruebas.",
      lat: -34.9,
      lng: -57.9,
      status: "rejected",
      refCode: "hub_REJ3CT3D",
      timezone: "America/Argentina/Buenos_Aires",
    },
  });
  console.log("✅ Hub rechazado:", hubRechazado.name);

  // ── USERS ──────────────────────────────────────────────
  // Gastón como super_admin.
  const gaston = await prisma.user.upsert({
    where: { phoneNumber: "+5493874000001" },
    update: {},
    create: {
      phoneNumber: "+5493874000001",
      fullName: "Gastón (Admin)",
      email: "lamboisgaston@gmail.com",
    },
  });

  // Fundador del hub pendiente.
  const fundador = await prisma.user.upsert({
    where: { phoneNumber: "+5493874000002" },
    update: {},
    create: {
      phoneNumber: "+5493874000002",
      fullName: "Ana López (Fundadora)",
    },
  });

  // Vecinos interesados en el hub pendiente (necesitamos 4 más para llegar a 5 total con la fundadora).
  const vecinosInteresados = [];
  for (let i = 3; i <= 6; i++) {
    const v = await prisma.user.upsert({
      where: { phoneNumber: `+549387400000${i}` },
      update: {},
      create: {
        phoneNumber: `+549387400000${i}`,
        fullName: `Vecino Interesado ${i - 2}`,
      },
    });
    vecinosInteresados.push(v);
  }

  // Proveedor en el hub activo.
  const userProveedor = await prisma.user.upsert({
    where: { phoneNumber: "+5491112345678" },
    update: {},
    create: {
      phoneNumber: "+5491112345678",
      fullName: "Carlos Pérez (Proveedor)",
    },
  });

  // Vecino comprador en el hub activo.
  const vecinoComprador = await prisma.user.upsert({
    where: { phoneNumber: "+5491199990001" },
    update: {},
    create: {
      phoneNumber: "+5491199990001",
      fullName: "María García (Vecina)",
    },
  });

  console.log("✅ Usuarios creados:", 2 + vecinosInteresados.length + 3);

  // ── MEMBERSHIPS ────────────────────────────────────────
  // Gastón es super_admin en el hub activo.
  await prisma.membership.upsert({
    where: { userId_hubId_role: { userId: gaston.id, hubId: hubActivo.id, role: "super_admin" } },
    update: {},
    create: { userId: gaston.id, hubId: hubActivo.id, role: "super_admin" },
  });

  // Fundadora: vecino con metadata.founder = true en el hub pendiente.
  await prisma.membership.upsert({
    where: { userId_hubId_role: { userId: fundador.id, hubId: hubPendiente.id, role: "vecino" } },
    update: {},
    create: {
      userId: fundador.id,
      hubId: hubPendiente.id,
      role: "vecino",
      metadata: { founder: true },
    },
  });

  // Actualizar el hub pendiente para apuntar al fundador.
  await prisma.hub.update({
    where: { id: hubPendiente.id },
    data: { createdByUserId: fundador.id },
  });

  // Vecinos interesados en el hub pendiente.
  for (const v of vecinosInteresados) {
    await prisma.membership.upsert({
      where: { userId_hubId_role: { userId: v.id, hubId: hubPendiente.id, role: "vecino" } },
      update: {},
      create: {
        userId: v.id,
        hubId: hubPendiente.id,
        role: "vecino",
        metadata: { interested_in_pending: true },
      },
    });
  }

  console.log(
    "✅ Memberships hub pendiente:",
    1 + vecinosInteresados.length,
    "(fundadora + interesados — faltan",
    5 - (1 + vecinosInteresados.length),
    "para activar)"
  );

  // Proveedor en el hub activo.
  const membershipProveedor = await prisma.membership.upsert({
    where: { userId_hubId_role: { userId: userProveedor.id, hubId: hubActivo.id, role: "proveedor_producto" } },
    update: {},
    create: { userId: userProveedor.id, hubId: hubActivo.id, role: "proveedor_producto" },
  });

  // Vecina compradora en el hub activo.
  await prisma.membership.upsert({
    where: { userId_hubId_role: { userId: vecinoComprador.id, hubId: hubActivo.id, role: "vecino" } },
    update: {},
    create: { userId: vecinoComprador.id, hubId: hubActivo.id, role: "vecino" },
  });

  // ── PROVIDER ───────────────────────────────────────────
  let provider = await prisma.provider.findUnique({
    where: { membershipId: membershipProveedor.id },
  });
  if (!provider) {
    provider = await prisma.provider.create({
      data: {
        membershipId: membershipProveedor.id,
        businessName: "Granja San Martín",
        description: "Verduras y frutas de estación directo del productor.",
        phoneBusiness: "+5491112345678",
        verified: true,
        verifiedAt: new Date(),
      },
    });
  }
  console.log("✅ Provider:", provider.businessName);

  // ── CATEGORIES ─────────────────────────────────────────
  const catVerduras = await prisma.category.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      hubId: hubActivo.id,
      type: "product",
      slug: "verduras",
      name: "Verduras",
      icon: "🥬",
      displayOrder: 1,
    },
  });

  const catFrutas = await prisma.category.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      hubId: hubActivo.id,
      type: "product",
      slug: "frutas",
      name: "Frutas",
      icon: "🍎",
      displayOrder: 2,
    },
  });
  console.log("✅ Categorías:", 2);

  // ── OFFERINGS ──────────────────────────────────────────
  const lechuga = await prisma.offering.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000010",
      providerId: provider.id,
      hubId: hubActivo.id,
      categoryId: catVerduras.id,
      type: "product",
      name: "Lechuga hidropónica",
      description: "Lechuga fresca de cultivo hidropónico, 300g.",
      price: 1200,
      priceType: "fixed",
      currency: "ARS",
      stock: 50,
    },
  });

  const tomate = await prisma.offering.upsert({
    where: { id: "00000000-0000-0000-0000-000000000011" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000011",
      providerId: provider.id,
      hubId: hubActivo.id,
      categoryId: catVerduras.id,
      type: "product",
      name: "Tomate perita",
      description: "Tomate perita kg, ideal para salsas.",
      price: 1800,
      priceType: "fixed",
      currency: "ARS",
      stock: 30,
    },
  });

  await prisma.offering.upsert({
    where: { id: "00000000-0000-0000-0000-000000000012" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000012",
      providerId: provider.id,
      hubId: hubActivo.id,
      categoryId: catFrutas.id,
      type: "product",
      name: "Manzana Red Delicious",
      description: "Manzana kg, dulce y crujiente.",
      price: 2200,
      priceType: "fixed",
      currency: "ARS",
      stock: 40,
    },
  });
  console.log("✅ Offerings:", 3);

  // ── CONVERSATION + ORDER de ejemplo ────────────────────
  const conversacion = await prisma.conversation.create({
    data: {
      userId: vecinoComprador.id,
      hubId: hubActivo.id,
      currentFlow: "place_order",
      currentStep: "completed",
      context: { lastOrderId: null },
    },
  });

  const order = await prisma.order.create({
    data: {
      orderNumber: "HY-2026-000001",
      hubId: hubActivo.id,
      buyerUserId: vecinoComprador.id,
      providerId: provider.id,
      status: "confirmed",
      subtotal: 3000,
      fee: 150,
      total: 3150,
      currency: "ARS",
      notes: "Dejar en portería.",
      items: {
        create: [
          {
            offeringId: lechuga.id,
            nameSnapshot: "Lechuga hidropónica",
            priceSnapshot: 1200,
            quantity: 1,
            subtotal: 1200,
          },
          {
            offeringId: tomate.id,
            nameSnapshot: "Tomate perita",
            priceSnapshot: 1800,
            quantity: 1,
            subtotal: 1800,
          },
        ],
      },
    },
  });

  await prisma.conversation.update({
    where: { id: conversacion.id },
    data: { context: { lastOrderId: order.id } },
  });

  console.log("✅ Pedido de ejemplo:", order.orderNumber, "| estado:", order.status);

  // ── RESUMEN ────────────────────────────────────────────
  console.log("\n📊 Resumen del seed:");
  console.log("  Hubs: 1 activo · 1 pendiente (necesita 1 interesado más para activarse) · 1 rechazado");
  console.log("  Fundadora del hub pendiente: Ana López (+5493874000002)");
  console.log("  ref_code del hub pendiente:", hubPendiente.refCode);
  console.log("  Proveedor: Carlos Pérez (+5491112345678) en Palermo Soho");
  console.log("  Vecina compradora: María García (+5491199990001)");
  console.log("\n✅ Seed completado.");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
