import { NextResponse } from "next/server";

import { defaultInventory, type UpsInventoryItem } from "@/lib/telemetry";
import { readJsonFile, writeJsonFile } from "@/lib/server-store";

const inventoryFile = "inventory.json";

export async function GET() {
  const inventory = await readJsonFile<UpsInventoryItem[]>(inventoryFile, defaultInventory);
  return NextResponse.json({ inventory });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { inventory?: UpsInventoryItem[] };

  if (!Array.isArray(body.inventory)) {
    return NextResponse.json({ error: "Inventory must be an array." }, { status: 400 });
  }

  const inventory = body.inventory.map((item) => ({
    batteryNominalV: Number(item.batteryNominalV || 0),
    capacityVa: Number(item.capacityVa || 0),
    deviceId: String(item.deviceId || "").trim(),
    floor: String(item.floor || "").trim(),
    id: String(item.id || item.upsId || crypto.randomUUID()).trim(),
    location: String(item.location || "").trim(),
    serial: String(item.serial || "").trim(),
    upsId: String(item.upsId || "").trim(),
  }));

  await writeJsonFile(inventoryFile, inventory);
  return NextResponse.json({ inventory });
}

