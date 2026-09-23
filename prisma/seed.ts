import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const SYSTEM_ROLES_TO_SEED = [
  {
    name: "OWNER",
    description: "Full administrative and ownership access across the organization and all its branches.",
  },
  {
    name: "MANAGER",
    description: "Operational management access across assigned branches.",
  },
  {
    name: "CASHIER",
    description: "Point of sale register and transaction processing access for assigned branches.",
  },
  {
    name: "INVENTORY_MANAGER",
    description: "Stock management, purchasing, and inventory control access for assigned branches.",
  },
  {
    name: "ACCOUNTANT",
    description: "Financial, taxation, and accounting report access across the organization.",
  },
];

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Neither DIRECT_URL nor DATABASE_URL is defined.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export async function seedRoles(): Promise<{ seededCount: number; roles: string[] }> {
  const seededRoles: string[] = [];

  for (const roleDef of SYSTEM_ROLES_TO_SEED) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: {
        description: roleDef.description,
      },
      create: {
        name: roleDef.name,
        description: roleDef.description,
      },
    });
    seededRoles.push(role.name);
  }

  return { seededCount: seededRoles.length, roles: seededRoles };
}

async function main() {
  console.log("Seeding system roles (idempotent)...");
  const result = await seedRoles();
  console.log(`Successfully ensured ${result.seededCount} system roles:`, result.roles.join(", "));
}

// Execute main if run directly as a script
if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed.ts")) {
  main()
    .catch((e) => {
      console.error("Error seeding roles:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
      await pool.end();
    });
}
