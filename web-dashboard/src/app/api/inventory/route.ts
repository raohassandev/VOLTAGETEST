import { NextResponse } from "next/server";
import { requireApiAuth, requireRole } from "@/lib/api-auth";

import { prisma, isDbEnabled } from "@/lib/db";
import { defaultInventory, type UpsInventoryItem } from "@/lib/telemetry";
import { readJsonFile, writeJsonFile } from "@/lib/server-store";
import { logAudit, requestIp } from "@/lib/audit";

const inventoryFile = "inventory.json";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  if (isDbEnabled()) {
    const units = await prisma.upsUnit.findMany({
      where: { active: true },
      orderBy: { upsId: "asc" },
      include: { devices: { take: 1, orderBy: { updatedAt: "desc" } } },
    });
    const inventory: UpsInventoryItem[] = units.map((u) => ({
      id: u.id,
      upsId: u.upsId,
      deviceId: u.devices[0]?.deviceId ?? "",
      serial: u.serial,
      floor: u.floor,
      location: u.location,
      capacityVa: u.capacityVa,
      batteryNominalV: u.batteryNominalV,
    }));
    return NextResponse.json({ inventory });
  }

  const inventory = await readJsonFile<UpsInventoryItem[]>(inventoryFile, defaultInventory);
  return NextResponse.json({ inventory });
}

export async function PUT(request: Request) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as { inventory?: UpsInventoryItem[] };
  if (!Array.isArray(body.inventory)) {
    return NextResponse.json({ error: "Inventory must be an array." }, { status: 400 });
  }

  const normalized: UpsInventoryItem[] = body.inventory.map((item) => ({
    batteryNominalV: Number(item.batteryNominalV || 0),
    capacityVa: Number(item.capacityVa || 0),
    deviceId: String(item.deviceId || "").trim(),
    floor: String(item.floor || "").trim(),
    id: String(item.id || item.upsId || crypto.randomUUID()).trim(),
    location: String(item.location || "").trim(),
    serial: String(item.serial || "").trim(),
    upsId: String(item.upsId || "").trim(),
  }));

  if (isDbEnabled()) {
    for (const item of normalized) {
      if (!item.upsId) continue;
      const unit = await prisma.upsUnit.upsert({
        where: { upsId: item.upsId },
        create: {
          upsId: item.upsId,
          name: item.upsId,
          serial: item.serial,
          floor: item.floor,
          location: item.location,
          capacityVa: item.capacityVa,
          batteryNominalV: item.batteryNominalV,
          active: true,
        },
        update: {
          serial: item.serial,
          floor: item.floor,
          location: item.location,
          capacityVa: item.capacityVa,
          batteryNominalV: item.batteryNominalV,
          active: true,
        },
      });

      if (item.deviceId) {
        await prisma.device.upsert({
          where: { deviceId: item.deviceId },
          create: { deviceId: item.deviceId, upsUnitId: unit.id },
          update: { upsUnitId: unit.id },
        });
      }
    }

    const units = await prisma.upsUnit.findMany({
      where: { active: true },
      orderBy: { upsId: "asc" },
      include: { devices: { take: 1, orderBy: { updatedAt: "desc" } } },
    });
    const inventory: UpsInventoryItem[] = units.map((u) => ({
      id: u.id,
      upsId: u.upsId,
      deviceId: u.devices[0]?.deviceId ?? "",
      serial: u.serial,
      floor: u.floor,
      location: u.location,
      capacityVa: u.capacityVa,
      batteryNominalV: u.batteryNominalV,
    }));
    await logAudit({ userId: auth.user.username, action: "inventory.bulk_update", entity: "UpsUnit", data: { count: normalized.length }, ip: requestIp(request) });
    return NextResponse.json({ inventory });
  }

  await writeJsonFile(inventoryFile, normalized);
  return NextResponse.json({ inventory: normalized });
}

export async function POST(request: Request) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as Partial<UpsInventoryItem>;
  if (!body.upsId) {
    return NextResponse.json({ error: "upsId is required." }, { status: 400 });
  }

  if (isDbEnabled()) {
    const unit = await prisma.upsUnit.upsert({
      where: { upsId: body.upsId },
      create: {
        upsId: body.upsId,
        name: body.upsId,
        serial: body.serial ?? "",
        floor: body.floor ?? "",
        location: body.location ?? "",
        capacityVa: Number(body.capacityVa ?? 0),
        batteryNominalV: Number(body.batteryNominalV ?? 48),
        active: true,
      },
      update: {
        serial: body.serial ?? "",
        floor: body.floor ?? "",
        location: body.location ?? "",
        capacityVa: Number(body.capacityVa ?? 0),
        batteryNominalV: Number(body.batteryNominalV ?? 48),
        active: true,
      },
    });

    if (body.deviceId) {
      await prisma.device.upsert({
        where: { deviceId: body.deviceId },
        create: { deviceId: body.deviceId, upsUnitId: unit.id },
        update: { upsUnitId: unit.id },
      });
    }

    await logAudit({ userId: auth.user.username, action: "inventory.upsert", entity: "UpsUnit", entityId: unit.id, data: { upsId: body.upsId }, ip: requestIp(request) });
    return NextResponse.json({ item: { ...body, id: unit.id } });
  }

  const inventory = await readJsonFile<UpsInventoryItem[]>(inventoryFile, defaultInventory);
  const item: UpsInventoryItem = {
    id: body.id || body.upsId,
    upsId: body.upsId,
    deviceId: body.deviceId ?? "",
    serial: body.serial ?? "",
    floor: body.floor ?? "",
    location: body.location ?? "",
    capacityVa: Number(body.capacityVa ?? 0),
    batteryNominalV: Number(body.batteryNominalV ?? 48),
  };
  const existing = inventory.findIndex((i) => i.upsId === item.upsId);
  if (existing >= 0) {
    inventory[existing] = item;
  } else {
    inventory.push(item);
  }
  await writeJsonFile(inventoryFile, inventory);
  return NextResponse.json({ item });
}

export async function DELETE(request: Request) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const upsId = searchParams.get("upsId");
  if (!upsId) return NextResponse.json({ error: "upsId required" }, { status: 400 });

  if (isDbEnabled()) {
    const unit = await prisma.upsUnit.update({
      where: { upsId },
      data: { active: false },
    });
    await logAudit({ userId: auth.user.username, action: "inventory.delete", entity: "UpsUnit", entityId: unit.id, data: { upsId }, ip: requestIp(request) });
    return NextResponse.json({ ok: true });
  }

  const inventory = await readJsonFile<UpsInventoryItem[]>(inventoryFile, defaultInventory);
  await writeJsonFile(inventoryFile, inventory.filter((i) => i.upsId !== upsId));
  return NextResponse.json({ ok: true });
}
