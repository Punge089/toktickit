import { getPrisma } from "../src/prisma.js";

// Lab 1 — Issue 3: the four supported categories.
const CATEGORY_NAMES = ["Account and Access", "Hardware", "Software", "Network"];

// Lab 2 — Issue 22: related systems, and Development Requesters.
// Requirement: running the seed twice must NOT create duplicates (BR — see
// specification.md §5.3). Every insert below is an upsert keyed on a unique
// column for exactly that reason.
const RELATED_SYSTEM_NAMES = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];

const ACTIVE_REQUESTERS = [
  { fullName: "Aran Suksawat", email: "aran.suksawat@example.dev", department: "Registrar" },
  { fullName: "Buppha Ratanakorn", email: "buppha.ratanakorn@example.dev", department: "Finance" },
  { fullName: "Chai Wongsawat", email: "chai.wongsawat@example.dev", department: "IT Services" },
  { fullName: "Duangjai Phromma", email: "duangjai.phromma@example.dev", department: "Library" },
];

const INACTIVE_REQUESTERS = [
  { fullName: "Somsak Jantawong", email: "somsak.jantawong@example.dev", department: "Alumni Relations" },
];

export async function seedCategories() {
  const prisma = getPrisma();
  for (const name of CATEGORY_NAMES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  return CATEGORY_NAMES.length;
}

export async function seedRelatedSystems() {
  const prisma = getPrisma();
  for (const name of RELATED_SYSTEM_NAMES) {
    await prisma.relatedSystem.upsert({ where: { name }, update: {}, create: { name } });
  }
  return RELATED_SYSTEM_NAMES.length;
}

export async function seedRequesters() {
  const prisma = getPrisma();
  for (const r of ACTIVE_REQUESTERS) {
    await prisma.requesterUser.upsert({
      where: { email: r.email },
      update: {},
      create: { ...r, isActive: true },
    });
  }
  for (const r of INACTIVE_REQUESTERS) {
    await prisma.requesterUser.upsert({
      where: { email: r.email },
      update: {},
      create: { ...r, isActive: false },
    });
  }
  return ACTIVE_REQUESTERS.length + INACTIVE_REQUESTERS.length;
}

export async function seedAll() {
  const categories = await seedCategories();
  const relatedSystems = await seedRelatedSystems();
  const requesters = await seedRequesters();
  return { categories, relatedSystems, requesters };
}

async function main() {
  const { categories, relatedSystems, requesters } = await seedAll();
  console.log(
    `Seeded (idempotent): ${categories} categories, ${relatedSystems} related systems, ${requesters} Development Requesters.`,
  );
}

// Only run main() when this file is executed directly (tsx prisma/seed.ts),
// not when its functions are imported by a test.
if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await getPrisma().$disconnect();
    });
}
