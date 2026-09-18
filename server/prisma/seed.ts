import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/lib/password.js";

// Lab 1 — Issue 3: the four supported categories.
const CATEGORY_NAMES = ["Account and Access", "Hardware", "Software", "Network"];

// Lab 2 — Issue 22: related systems.
const RELATED_SYSTEM_NAMES = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];

// Lab 3 — Issue 63: real Users with roles, credentials, and activation
// state (docs/lab-03/specification.md §7 Seed, labsheet §5.3). Every
// upsert's `update` clause actually updates the row (not `update: {}`),
// so re-running the seed converges every named account back to this
// canonical state rather than leaving stale data or duplicating rows.
//
// SEED_PASSWORD is a single, documented, local-development-only
// credential (never a real personal password) — see README.md and
// specification.md §7. It doubles as both the "already changed" password
// for most seeded accounts and the initial/temporary password for the
// one account that demonstrates the mandatory first-login change.
function seedPassword(): string {
  if (process.env.SEED_PASSWORD) return process.env.SEED_PASSWORD;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SEED_PASSWORD must be set explicitly when NODE_ENV=production.");
  }
  return "TokTick-Dev#2026";
}

interface SeedUser {
  fullName: string;
  email: string;
  department?: string;
  role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
  isActive: boolean;
  mustChangePassword: boolean;
}

const SEED_USERS: SeedUser[] = [
  // Requesters (labsheet §5.3: at least 4 active + 1 inactive) — the four
  // original Lab 2 Development Requesters, evolved into real accounts.
  { fullName: "Aran Suksawat", email: "aran.suksawat@example.dev", department: "Registrar", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { fullName: "Buppha Ratanakorn", email: "buppha.ratanakorn@example.dev", department: "Finance", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { fullName: "Chai Wongsawat", email: "chai.wongsawat@example.dev", department: "IT Services", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { fullName: "Duangjai Phromma", email: "duangjai.phromma@example.dev", department: "Library", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { fullName: "Somsak Jantawong", email: "somsak.jantawong@example.dev", department: "Alumni Relations", role: "REQUESTER", isActive: false, mustChangePassword: false },
  // A 5th active Requester who must change their password at next login,
  // specifically to demonstrate/test AC-02 (mandatory first-login change)
  // with a seeded, reproducible account.
  { fullName: "Ekkachai Mai", email: "ekkachai.mai@example.dev", department: "Registrar", role: "REQUESTER", isActive: true, mustChangePassword: true },

  // IT Staff (labsheet §5.3: at least 3 active + 1 inactive).
  { fullName: "Jennifer Anderson", email: "jennifer.anderson@example.dev", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { fullName: "Michael Brown", email: "michael.brown@example.dev", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { fullName: "Sarah Johnson", email: "sarah.johnson@example.dev", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { fullName: "David Lee", email: "david.lee@example.dev", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { fullName: "Robert Wilson", email: "robert.wilson@example.dev", role: "IT_STAFF", isActive: false, mustChangePassword: false },

  // Administrator (labsheet §5.3: at least 1 active). Exactly one is
  // seeded on purpose, so the "last active Administrator" rule (BR-32) is
  // meaningfully in effect from a fresh database; tests/E2E that need to
  // exercise deactivating *a* Administrator create a temporary second one
  // via the Admin API rather than relying on a second seeded account.
  { fullName: "John Smith", email: "john.smith@example.dev", role: "ADMINISTRATOR", isActive: true, mustChangePassword: false },
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

export async function seedUsers() {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(seedPassword());

  for (const u of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        fullName: u.fullName,
        department: u.department ?? null,
        role: u.role,
        isActive: u.isActive,
        mustChangePassword: u.mustChangePassword,
        passwordHash,
      },
      create: {
        fullName: u.fullName,
        email: u.email,
        department: u.department ?? null,
        role: u.role,
        isActive: u.isActive,
        mustChangePassword: u.mustChangePassword,
        passwordHash,
      },
    });
  }

  return SEED_USERS.length;
}

// Seed Tickets distributed across every status/priority/ownership
// combination (labsheet §5.3). ticketNumbers use a fixed past year
// (2024) specifically so they never collide with TicketCounter's
// per-current-year sequence used by real Ticket creation through the API.
interface SeedTicket {
  ticketNumber: string;
  requesterEmail: string;
  categoryName: string;
  relatedSystemName: string;
  summary: string;
  description: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  itPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  currentStatus:
    | "NEW"
    | "OPEN"
    | "IN_PROGRESS"
    | "WAITING_FOR_REQUESTER"
    | "RESOLVED"
    | "CLOSED"
    | "REOPENED"
    | "CANCELLED";
  ownerEmail: string | null;
  resolutionSummary?: string;
  requesterReportedResolved?: boolean;
}

const SEED_TICKETS: SeedTicket[] = [
  { ticketNumber: "TKT-2024-000101", requesterEmail: "aran.suksawat@example.dev", categoryName: "Hardware", relatedSystemName: "Corporate Laptop", summary: "Laptop battery drains quickly", description: "The battery on my corporate laptop drains from full to empty within about two hours, even when idle.", requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "NEW", ownerEmail: null },
  { ticketNumber: "TKT-2024-000102", requesterEmail: "buppha.ratanakorn@example.dev", categoryName: "Network", relatedSystemName: "VPN", summary: "Cannot connect to VPN from home", description: "VPN client fails to establish a connection with a timeout error every time I try from home.", requestedPriority: "HIGH", itPriority: "HIGH", currentStatus: "OPEN", ownerEmail: "jennifer.anderson@example.dev" },
  { ticketNumber: "TKT-2024-000103", requesterEmail: "chai.wongsawat@example.dev", categoryName: "Software", relatedSystemName: "Email", summary: "Email not syncing on mobile", description: "New emails stop appearing on my phone's mail app after about a day; a full reinstall fixes it temporarily.", requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "IN_PROGRESS", ownerEmail: "michael.brown@example.dev" },
  { ticketNumber: "TKT-2024-000104", requesterEmail: "duangjai.phromma@example.dev", categoryName: "Account and Access", relatedSystemName: "LEB2 App", summary: "New employee setup request", description: "Please set up system access for a new library assistant starting next Monday.", requestedPriority: "LOW", itPriority: "LOW", currentStatus: "RESOLVED", ownerEmail: "sarah.johnson@example.dev", resolutionSummary: "Access provisioned for the new hire and confirmed working by the requester." },
  { ticketNumber: "TKT-2024-000105", requesterEmail: "aran.suksawat@example.dev", categoryName: "Hardware", relatedSystemName: "Printer", summary: "Printer keeps showing offline", description: "The 3rd floor printer shows offline in Windows even though it is powered on and connected to the network.", requestedPriority: "MEDIUM", itPriority: "LOW", currentStatus: "OPEN", ownerEmail: "michael.brown@example.dev" },
  { ticketNumber: "TKT-2024-000106", requesterEmail: "buppha.ratanakorn@example.dev", categoryName: "Account and Access", relatedSystemName: "Grade Submission App", summary: "Request access to grade submission", description: "I need read access to the grade submission app for the upcoming semester audit.", requestedPriority: "LOW", itPriority: "LOW", currentStatus: "WAITING_FOR_REQUESTER", ownerEmail: "jennifer.anderson@example.dev" },
  { ticketNumber: "TKT-2024-000107", requesterEmail: "chai.wongsawat@example.dev", categoryName: "Software", relatedSystemName: "Grade Submission App", summary: "Outlook freezing intermittently", description: "Outlook freezes for about 10 seconds several times a day, especially when opening large attachments.", requestedPriority: "HIGH", itPriority: "MEDIUM", currentStatus: "IN_PROGRESS", ownerEmail: "sarah.johnson@example.dev" },
  { ticketNumber: "TKT-2024-000108", requesterEmail: "duangjai.phromma@example.dev", categoryName: "Hardware", relatedSystemName: "Corporate Laptop", summary: "Docking station not detected", description: "My docking station is not detected when I connect my laptop, external monitors stay blank.", requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "RESOLVED", ownerEmail: "michael.brown@example.dev", resolutionSummary: "Replaced a faulty docking station cable; monitors confirmed working by the requester." },
  { ticketNumber: "TKT-2024-000109", requesterEmail: "aran.suksawat@example.dev", categoryName: "Software", relatedSystemName: "LEB2 App", summary: "Software installation request", description: "Requesting installation of the department's statistics software package on my workstation.", requestedPriority: "LOW", itPriority: "LOW", currentStatus: "CLOSED", ownerEmail: "david.lee@example.dev", resolutionSummary: "Software installed and licensed; requester confirmed it opens correctly." },
  { ticketNumber: "TKT-2024-000110", requesterEmail: "buppha.ratanakorn@example.dev", categoryName: "Hardware", relatedSystemName: "Corporate Laptop", summary: "Multi-monitor not detected", description: "Only one of my two external monitors is detected after the latest Windows update.", requestedPriority: "MEDIUM", itPriority: "LOW", currentStatus: "IN_PROGRESS", ownerEmail: "david.lee@example.dev" },
  { ticketNumber: "TKT-2024-000111", requesterEmail: "chai.wongsawat@example.dev", categoryName: "Network", relatedSystemName: "Campus Wi-Fi", summary: "Wi-Fi drops in the east wing", description: "Campus Wi-Fi disconnects every few minutes specifically in the east wing meeting rooms.", requestedPriority: "HIGH", itPriority: "HIGH", currentStatus: "NEW", ownerEmail: null },
  { ticketNumber: "TKT-2024-000112", requesterEmail: "duangjai.phromma@example.dev", categoryName: "Account and Access", relatedSystemName: "Email", summary: "Locked out of email account", description: "I cannot log into my email account; it says my account is locked after too many attempts.", requestedPriority: "URGENT", itPriority: "URGENT", currentStatus: "OPEN", ownerEmail: "jennifer.anderson@example.dev" },
  { ticketNumber: "TKT-2024-000113", requesterEmail: "ekkachai.mai@example.dev", categoryName: "Software", relatedSystemName: "Email", summary: "Signature not applying to new emails", description: "My configured email signature stopped appearing automatically on new messages.", requestedPriority: "LOW", itPriority: "LOW", currentStatus: "NEW", ownerEmail: null },
  { ticketNumber: "TKT-2024-000114", requesterEmail: "aran.suksawat@example.dev", categoryName: "Network", relatedSystemName: "VPN", summary: "VPN disconnects after 10 minutes", description: "VPN connection drops consistently after about 10 minutes of being idle, requiring a manual reconnect.", requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "WAITING_FOR_REQUESTER", ownerEmail: "sarah.johnson@example.dev", requesterReportedResolved: true },
  { ticketNumber: "TKT-2024-000115", requesterEmail: "buppha.ratanakorn@example.dev", categoryName: "Hardware", relatedSystemName: "Printer", summary: "Print jobs stuck in queue", description: "Print jobs sit in the queue for over 30 minutes before printing, or never print at all.", requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "REOPENED", ownerEmail: "michael.brown@example.dev" },
  { ticketNumber: "TKT-2024-000116", requesterEmail: "chai.wongsawat@example.dev", categoryName: "Account and Access", relatedSystemName: "LEB2 App", summary: "Duplicate access request submitted", description: "I accidentally submitted this access request twice by mistake.", requestedPriority: "LOW", itPriority: "LOW", currentStatus: "CANCELLED", ownerEmail: null },
  { ticketNumber: "TKT-2024-000117", requesterEmail: "duangjai.phromma@example.dev", categoryName: "Software", relatedSystemName: "Grade Submission App", summary: "Grade submission form rejects valid scores", description: "The grade submission form rejects scores of exactly 100, showing a validation error.", requestedPriority: "HIGH", itPriority: "HIGH", currentStatus: "OPEN", ownerEmail: "david.lee@example.dev" },
  { ticketNumber: "TKT-2024-000118", requesterEmail: "aran.suksawat@example.dev", categoryName: "Hardware", relatedSystemName: "Corporate Laptop", summary: "Laptop keyboard sticky keys", description: "Several keys on my laptop keyboard stick or repeat characters when typing.", requestedPriority: "LOW", itPriority: "LOW", currentStatus: "NEW", ownerEmail: null },
  { ticketNumber: "TKT-2024-000119", requesterEmail: "buppha.ratanakorn@example.dev", categoryName: "Network", relatedSystemName: "Campus Wi-Fi", summary: "Guest Wi-Fi not issuing IP addresses", description: "Guest Wi-Fi network shows connected but never receives an IP address.", requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "IN_PROGRESS", ownerEmail: "jennifer.anderson@example.dev" },
  { ticketNumber: "TKT-2024-000120", requesterEmail: "chai.wongsawat@example.dev", categoryName: "Software", relatedSystemName: "LEB2 App", summary: "LEB2 App crashes on file upload", description: "The LEB2 App crashes every time I try to upload a file larger than 10MB.", requestedPriority: "HIGH", itPriority: "URGENT", currentStatus: "IN_PROGRESS", ownerEmail: "sarah.johnson@example.dev" },
  { ticketNumber: "TKT-2024-000121", requesterEmail: "duangjai.phromma@example.dev", categoryName: "Account and Access", relatedSystemName: "Grade Submission App", summary: "Need temporary elevated access for audit", description: "Requesting temporary elevated read access for the annual compliance audit next week.", requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "RESOLVED", ownerEmail: "david.lee@example.dev", resolutionSummary: "Temporary access granted with an expiry date; requester confirmed access works." },
  { ticketNumber: "TKT-2024-000122", requesterEmail: "aran.suksawat@example.dev", categoryName: "Hardware", relatedSystemName: "Printer", summary: "Printer toner low warning stuck", description: "The printer shows a persistent low-toner warning even right after a new cartridge was installed.", requestedPriority: "LOW", itPriority: "LOW", currentStatus: "CLOSED", ownerEmail: "michael.brown@example.dev", resolutionSummary: "Reseated the toner cartridge sensor; warning cleared and confirmed by the requester." },
  { ticketNumber: "TKT-2024-000123", requesterEmail: "buppha.ratanakorn@example.dev", categoryName: "Network", relatedSystemName: "VPN", summary: "Split tunneling needed for VPN", description: "Requesting split tunneling be enabled on my VPN profile so local printing still works while connected.", requestedPriority: "LOW", itPriority: "LOW", currentStatus: "NEW", ownerEmail: null },
  { ticketNumber: "TKT-2024-000124", requesterEmail: "chai.wongsawat@example.dev", categoryName: "Software", relatedSystemName: "Email", summary: "Calendar invites not appearing", description: "Meeting invites sent to my email do not appear in my calendar app, though the email itself arrives.", requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "WAITING_FOR_REQUESTER", ownerEmail: "jennifer.anderson@example.dev" },
  { ticketNumber: "TKT-2024-000125", requesterEmail: "duangjai.phromma@example.dev", categoryName: "Hardware", relatedSystemName: "Corporate Laptop", summary: "External mouse not recognized", description: "A USB mouse is not recognized on my laptop, though it works fine on other computers.", requestedPriority: "LOW", itPriority: "LOW", currentStatus: "OPEN", ownerEmail: null },
  { ticketNumber: "TKT-2024-000126", requesterEmail: "ekkachai.mai@example.dev", categoryName: "Account and Access", relatedSystemName: "LEB2 App", summary: "Cannot reset LEB2 App password", description: "The password reset link for the LEB2 App times out before I can set a new password.", requestedPriority: "HIGH", itPriority: "HIGH", currentStatus: "NEW", ownerEmail: null },
];

export async function seedTickets() {
  const prisma = getPrisma();
  const categories = await prisma.category.findMany();
  const relatedSystems = await prisma.relatedSystem.findMany();
  const users = await prisma.user.findMany();

  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));
  const relatedSystemIdByName = new Map(relatedSystems.map((r) => [r.name, r.id]));
  const userIdByEmail = new Map(users.map((u) => [u.email, u.id]));

  for (const t of SEED_TICKETS) {
    const requesterId = userIdByEmail.get(t.requesterEmail);
    const categoryId = categoryIdByName.get(t.categoryName);
    const relatedSystemId = relatedSystemIdByName.get(t.relatedSystemName);
    const ownerId = t.ownerEmail ? (userIdByEmail.get(t.ownerEmail) ?? null) : null;
    if (!requesterId || !categoryId || !relatedSystemId) {
      throw new Error(`Seed ticket ${t.ticketNumber} references a missing reference row.`);
    }

    const data = {
      requesterId,
      categoryId,
      relatedSystemId,
      summary: t.summary,
      description: t.description,
      requestedPriority: t.requestedPriority,
      itPriority: t.itPriority,
      currentStatus: t.currentStatus,
      ownerId,
      resolutionSummary: t.resolutionSummary ?? null,
      requesterResolvedAt: t.requesterReportedResolved ? new Date() : null,
    };

    await prisma.ticket.upsert({
      where: { ticketNumber: t.ticketNumber },
      update: data,
      create: { ticketNumber: t.ticketNumber, ...data },
    });
  }

  return SEED_TICKETS.length;
}

// Example Public Comments and Internal Notes (labsheet §5.3/§4.6) — no
// sensitive information, created only the first time a given seed ticket
// has none, so re-running the seed never duplicates them.
async function seedCommentsAndNotesFor(ticketNumber: string, comments: string[], notes: string[]) {
  const prisma = getPrisma();
  const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
  if (!ticket) return { comments: 0, notes: 0 };

  const requester = await prisma.user.findUniqueOrThrow({ where: { id: ticket.requesterId } });
  const staff = ticket.ownerId
    ? await prisma.user.findUniqueOrThrow({ where: { id: ticket.ownerId } })
    : await prisma.user.findFirstOrThrow({ where: { role: "IT_STAFF", isActive: true } });

  let commentsCreated = 0;
  const existingComments = await prisma.publicComment.count({ where: { ticketId: ticket.id } });
  if (existingComments === 0) {
    for (const [i, body] of comments.entries()) {
      await prisma.publicComment.create({
        data: { ticketId: ticket.id, authorId: i % 2 === 0 ? requester.id : staff.id, body },
      });
      commentsCreated += 1;
    }
  }

  let notesCreated = 0;
  const existingNotes = await prisma.internalNote.count({ where: { ticketId: ticket.id } });
  if (existingNotes === 0) {
    for (const body of notes) {
      await prisma.internalNote.create({ data: { ticketId: ticket.id, authorId: staff.id, body } });
      notesCreated += 1;
    }
  }

  return { comments: commentsCreated, notes: notesCreated };
}

export async function seedCommentsAndNotes() {
  let comments = 0;
  let notes = 0;

  const r1 = await seedCommentsAndNotesFor(
    "TKT-2024-000102",
    [
      "Still happening after restarting the VPN client, any update?",
      "We are investigating the issue on your device. We will update you shortly.",
    ],
    ["Checked firewall rules, nothing obviously blocking this user. Escalating to network team."],
  );
  const r2 = await seedCommentsAndNotesFor(
    "TKT-2024-000103",
    ["Thank you for the update. Please let me know if you need additional information."],
    ["Reproduced the sync delay locally; looks like a mail app cache issue, not server-side."],
  );
  const r3 = await seedCommentsAndNotesFor(
    "TKT-2024-000114",
    ["This seems to be happening less often now, might already be fixed."],
    ["Requester reports intermittent improvement; keeping ticket open one more cycle to confirm."],
  );

  for (const r of [r1, r2, r3]) {
    comments += r.comments;
    notes += r.notes;
  }
  return { comments, notes };
}

export async function seedAll() {
  const categories = await seedCategories();
  const relatedSystems = await seedRelatedSystems();
  const users = await seedUsers();
  const tickets = await seedTickets();
  const { comments, notes } = await seedCommentsAndNotes();
  return { categories, relatedSystems, users, tickets, comments, notes };
}

async function main() {
  const { categories, relatedSystems, users, tickets, comments, notes } = await seedAll();
  console.log(
    `Seeded (idempotent): ${categories} categories, ${relatedSystems} related systems, ` +
      `${users} users, ${tickets} tickets, ${comments} comments created, ${notes} notes created.`,
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
