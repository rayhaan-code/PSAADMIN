// Seed: creates locations, a manager account, and ingests all Excel files
// found in prisma/seed-data/ using the same import engine the app uses.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import { LOCATIONS } from '../src/lib/mappings.js';
import { importWorkbookBuffer } from '../src/services/import/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(__dirname, 'seed-data');

async function main() {
  // Skip the (slow) Excel import if the DB already has customers — keeps
  // container restarts fast. Locations + manager are still ensured below.
  const existingCustomers = await prisma.customer.count();
  const skipImport = existingCustomers > 0;
  if (skipImport) {
    console.log(`DB already has ${existingCustomers} customers — ensuring locations/manager only, skipping Excel import.`);
  }

  console.log('Seeding locations...');
  for (const name of LOCATIONS) {
    await prisma.location.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Manager account (credentials configurable via env).
  const managerEmail = (process.env.SEED_MANAGER_EMAIL || 'manager@taawun-crm.local').toLowerCase();
  const managerPass = process.env.SEED_MANAGER_PASSWORD || 'manager123';
  const existingMgr = await prisma.user.findUnique({ where: { email: managerEmail } });
  if (!existingMgr) {
    const passwordHash = await bcrypt.hash(managerPass, 10);
    await prisma.user.create({
      data: { name: 'Manager', email: managerEmail, passwordHash, role: 'MANAGER' },
    });
    console.log(`Created manager: ${managerEmail} / ${managerPass}  (change after first login)`);
  } else {
    console.log(`Manager already exists: ${managerEmail}`);
  }

  const manager = await prisma.user.findUnique({ where: { email: managerEmail } });

  if (skipImport) {
    console.log('Skipping Excel import (DB already populated).');
    return;
  }

  if (!fs.existsSync(SEED_DIR)) {
    console.log(`No seed-data directory at ${SEED_DIR} — skipping Excel import.`);
    return;
  }

  const files = fs.readdirSync(SEED_DIR).filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~'));
  console.log(`\nImporting ${files.length} Excel files from seed-data/ ...`);

  let grandCreated = 0;
  let grandUpdated = 0;
  let grandSkipped = 0;

  for (const file of files) {
    const buffer = fs.readFileSync(path.join(SEED_DIR, file));
    try {
      const r = await importWorkbookBuffer(buffer, file, { createdById: manager?.id || null });
      grandCreated += r.created;
      grandUpdated += r.updated;
      grandSkipped += r.skipped;
      console.log(`  ✓ ${file} [${r.format}] created=${r.created} updated=${r.updated} skipped=${r.skipped}`);
    } catch (err) {
      console.log(`  ✗ ${file} — ${err.message}`);
    }
  }

  console.log(`\nDone. Total created=${grandCreated} updated=${grandUpdated} skipped=${grandSkipped}`);

  // Default password notice for auto-created agents.
  const agents = await prisma.user.count({ where: { role: 'AGENT' } });
  console.log(`Auto-created ${agents} agent accounts (default password: changeme123). Reset them in the Users admin page.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
