// Import orchestration: detect format, parse, upsert into DB, record batch + activities.
import XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { detectFormat } from './detect.js';
import { parseWorkbook } from './parsers.js';
import { detectLocation } from '../../lib/mappings.js';

// Cache of name->id within a single import run to cut DB round-trips.
async function getOrCreateLocation(name, cache) {
  if (!name) return null;
  if (cache.has(name)) return cache.get(name);
  const loc = await prisma.location.upsert({
    where: { name },
    update: {},
    create: { name },
  });
  cache.set(name, loc.id);
  return loc.id;
}

async function getOrCreateAgent(name, locationId, cache) {
  if (!name) return null;
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@taawun-crm.local`;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  // Default password for auto-created agents — must be reset on first login.
  const passwordHash = await bcrypt.hash('changeme123', 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: 'AGENT', locationId, active: true },
  });
  cache.set(key, user.id);
  return user.id;
}

// Import a single workbook buffer. Returns a summary.
export async function importWorkbookBuffer(buffer, filename, { createdById = null, assignToUserId = null } = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const format = detectFormat(workbook);
  if (format === 'unknown') {
    throw new Error(`Could not detect format for "${filename}". Expected a Renewal, Follow-up tracker, or Meta Leads sheet.`);
  }

  const records = parseWorkbook(workbook, format, { filename });
  const locCache = new Map();
  const agentCache = new Map();

  const fileLocation = detectLocation(filename);
  const fileLocationId = await getOrCreateLocation(fileLocation, locCache);

  const batch = await prisma.importBatch.create({
    data: {
      filename,
      format,
      locationId: fileLocationId,
      rowCount: records.length,
      createdById,
    },
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const rec of records) {
    try {
      const locationId = (await getOrCreateLocation(rec.location, locCache)) ?? fileLocationId;
      // If the importer chose an explicit admin/agent to assign to, that overrides the
      // per-row agent from the sheet. Otherwise fall back to the sheet's agent.
      const assignedAgentId = assignToUserId ?? (await getOrCreateAgent(rec.agent, locationId, agentCache));
      const program = rec.program || 'General';

      // Dedupe key: phone + program + location
      const existing = await prisma.customer.findFirst({
        where: { phone: rec.phone, program, locationId: locationId ?? null },
      });

      const data = {
        name: rec.name ?? existing?.name ?? null,
        phone: rec.phone,
        phoneRaw: rec.phoneRaw ?? existing?.phoneRaw ?? null,
        whatsapp: rec.whatsapp ?? existing?.whatsapp ?? null,
        email: rec.email ?? existing?.email ?? null,
        age: rec.age ?? existing?.age ?? null,
        activity: rec.activity ?? existing?.activity ?? null,
        program,
        listType: rec.listType,
        locationId,
        // Explicit override always wins; otherwise keep sheet agent, then existing.
        assignedAgentId: assignToUserId ?? assignedAgentId ?? existing?.assignedAgentId ?? null,
        status: rec.status ?? existing?.status ?? null,
        paymentStatus: rec.paymentStatus ?? existing?.paymentStatus ?? null,
        leadStage: rec.leadStage ?? existing?.leadStage ?? null,
        source: rec.source ?? existing?.source ?? null,
        packageType: rec.packageType ?? existing?.packageType ?? null,
        noc: rec.noc ?? existing?.noc ?? null,
        renewalDate: rec.renewalDate ?? existing?.renewalDate ?? null,
        inquiryDate: rec.inquiryDate ?? existing?.inquiryDate ?? null,
        // Only seed nextFollowUpDate from import if there isn't one already.
        nextFollowUpDate: existing?.nextFollowUpDate ?? rec.nextFollowUpDate ?? null,
        sessions: rec.sessions ?? existing?.sessions ?? undefined,
        notes: mergeNotes(existing?.notes, rec.notes),
        sourceFile: rec.sourceFile,
        importBatchId: batch.id,
      };

      if (existing) {
        await prisma.customer.update({ where: { id: existing.id }, data });
        await prisma.activity.create({
          data: { customerId: existing.id, userId: createdById, type: 'IMPORT', detail: `Updated from ${filename} (${rec.month || format})` },
        });
        updated++;
      } else {
        const c = await prisma.customer.create({ data });
        await prisma.activity.create({
          data: { customerId: c.id, userId: createdById, type: 'IMPORT', detail: `Imported from ${filename} (${rec.month || format})` },
        });
        created++;
      }
    } catch (err) {
      skipped++;
      // eslint-disable-next-line no-console
      console.error('Row import error:', err.message);
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { createdCount: created, updatedCount: updated, skippedCount: skipped },
  });

  return { format, filename, total: records.length, created, updated, skipped, batchId: batch.id };
}

// Append new import notes to existing notes without losing manual history.
function mergeNotes(existing, incoming) {
  if (!incoming) return existing ?? null;
  if (!existing) return incoming;
  if (existing.includes(incoming)) return existing;
  return `${existing}\n[import] ${incoming}`;
}
