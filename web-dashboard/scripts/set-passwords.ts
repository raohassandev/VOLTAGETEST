/**
 * Set passwords for admin and manufacturer users.
 * Creates users if they don't exist, updates password if they do.
 * Usage: npx tsx scripts/set-passwords.ts
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USERS = [
  { username: "admin",        password: "Admin@2026!",  role: "admin" },
  { username: "manufacturer", password: "AMX@202526",   role: "manufacturer" },
];

async function main() {
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 12);
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    if (existing) {
      await prisma.user.update({
        where: { username: u.username },
        data: { passwordHash: hash, role: u.role, active: true },
      });
      console.log(`✅ Updated: ${u.username} (${u.role})`);
    } else {
      await prisma.user.create({
        data: { username: u.username, passwordHash: hash, role: u.role, active: true },
      });
      console.log(`✅ Created: ${u.username} (${u.role})`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
