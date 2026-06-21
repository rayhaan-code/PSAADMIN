// Parse each format's sheets into normalized "raw customer" records.
// A raw record is format-agnostic; the upsert engine turns it into DB rows.
import XLSX from 'xlsx';
import { findHeaderRow, columnMap, col } from './detect.js';
import { parseExcelDate } from '../../lib/date.js';
import { normalizePhone } from '../../lib/phone.js';
import {
  normalizeAgentName,
  normalizeProgram,
  normalizeStatus,
  normalizePaymentStatus,
  normalizeLeadStage,
  detectLocation,
} from '../../lib/mappings.js';

function cell(row, idx) {
  if (idx < 0) return '';
  const v = row[idx];
  return v === undefined || v === null ? '' : String(v).trim();
}

function rawCell(row, idx) {
  if (idx < 0) return null;
  return row[idx];
}

// Combine the up-to-3 follow-up note columns into one notes string.
function combineFollowUps(parts) {
  return parts.filter((p) => p && String(p).trim()).map((p) => String(p).trim()).join(' | ');
}

// ---------- RENEWAL / INVOICE FORMAT ----------
// Header: Invoicee, Phone Number, Invoiced for, Validity, Invoiced/Consumed/Scheduled/Yet Sessions,
//         Admin, Payment Status, Follow up 1/2/3
export function parseRenewal(workbook, { filename }) {
  const records = [];
  const locationFromFile = detectLocation(filename);

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    const headerIdx = findHeaderRow(rows, ['invoicee', 'validity']);
    if (headerIdx < 0) continue;
    const map = columnMap(rows[headerIdx]);

    const ci = {
      name: col(map, 'invoicee'),
      phone: col(map, 'phone number', 'phone'),
      invoicedFor: col(map, 'invoiced for'),
      validity: col(map, 'validity'),
      invoiced: col(map, 'invoiced sessions'),
      consumed: col(map, 'consumed sessions'),
      scheduled: col(map, 'scheduled sessions'),
      yet: col(map, 'yet to be schedule', 'yet to be scheduled', 'yet to'),
      admin: col(map, 'admin'),
      payment: col(map, 'payment status'),
      f1: col(map, 'follow up 1'),
      f2: col(map, 'follow up 2'),
      f3: col(map, 'follow up 3'),
    };

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const name = cell(row, ci.name);
      const phoneRaw = cell(row, ci.phone);
      if (!name && !phoneRaw) continue; // empty row
      const phone = normalizePhone(phoneRaw);
      if (!phone) continue;

      const program = normalizeProgram(cell(row, ci.invoicedFor));
      const notes = combineFollowUps([cell(row, ci.f1), cell(row, ci.f2), cell(row, ci.f3)]);

      records.push({
        format: 'renewal',
        listType: 'RENEWAL',
        name: name || null,
        phone,
        phoneRaw: phoneRaw || null,
        program,
        activity: cell(row, ci.invoicedFor) || null,
        location: locationFromFile,
        agent: normalizeAgentName(cell(row, ci.admin)),
        paymentStatus: normalizePaymentStatus(cell(row, ci.payment)),
        renewalDate: parseExcelDate(rawCell(row, ci.validity)),
        sessions: {
          invoiced: cell(row, ci.invoiced) || null,
          consumed: cell(row, ci.consumed) || null,
          scheduled: cell(row, ci.scheduled) || null,
          yetToSchedule: cell(row, ci.yet) || null,
        },
        notes: notes || null,
        sourceFile: filename,
        month: sheetName,
      });
    }
  }
  return records;
}

// ---------- LAPSED FOLLOW-UP TRACKER ----------
// One sheet per sport (+ a Summary sheet we skip). Header row ~3.
// Name, Phone, Activity, Admin Name, Follow Up Date, Status, +3 follow-up cols
export function parseFollowup(workbook, { filename }) {
  const records = [];
  const locationFromFile = detectLocation(filename);

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.trim().toLowerCase() === 'summary') continue;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    const headerIdx = findHeaderRow(rows, ['name', 'admin name', 'follow up date']);
    if (headerIdx < 0) continue;
    const map = columnMap(rows[headerIdx]);

    const ci = {
      name: col(map, 'name'),
      phone: col(map, 'phone'),
      activity: col(map, 'activity'),
      admin: col(map, 'admin name', 'admin'),
      fuDate: col(map, 'follow up date'),
      status: col(map, 'status'),
      f1: col(map, 'academy follow up', 'first follow up'),
      f2: col(map, 'camp follow up'),
      f3: col(map, 'third follow up'),
    };

    const sheetProgram = normalizeProgram(sheetName);

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const name = cell(row, ci.name);
      const phoneRaw = cell(row, ci.phone);
      if (!name && !phoneRaw) continue;
      const phone = normalizePhone(phoneRaw);
      if (!phone) continue;

      const rawStatus = cell(row, ci.status);
      const fuNotes = combineFollowUps([cell(row, ci.f1), cell(row, ci.f2), cell(row, ci.f3)]);
      const notes = [rawStatus, fuNotes].filter(Boolean).join(' | ');

      records.push({
        format: 'followup',
        listType: 'FOLLOW_UP',
        name: name || null,
        phone,
        phoneRaw: phoneRaw || null,
        program: sheetProgram || normalizeProgram(cell(row, ci.activity)),
        activity: cell(row, ci.activity) || null,
        location: locationFromFile,
        agent: normalizeAgentName(cell(row, ci.admin)),
        // Derive status from the Status cell, or fall back to the follow-up notes.
        status: normalizeStatus(rawStatus || fuNotes),
        nextFollowUpDate: parseExcelDate(rawCell(row, ci.fuDate)),
        notes: notes || null,
        sourceFile: filename,
        month: sheetName,
      });
    }
  }
  return records;
}

// ---------- META LEADS ----------
// One sheet per month. Header row 0. Name often blank.
export function parseMeta(workbook, { filename }) {
  const records = [];
  const locationFromFile = detectLocation(filename);

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    const headerIdx = findHeaderRow(rows, ['lead stage', 'source']);
    if (headerIdx < 0) continue;
    const map = columnMap(rows[headerIdx]);

    const ci = {
      name: col(map, 'name'),
      contact: col(map, 'contact number', 'contact'),
      whatsapp: col(map, 'whatsapp number', 'whatsapp'),
      age: col(map, 'age'),
      email: col(map, 'email'),
      inquiryDate: col(map, 'inquiry date'),
      source: col(map, 'source'),
      leadStage: col(map, 'lead stage'),
      program: col(map, 'program'),
      status: col(map, 'status'),
      enrollment: col(map, 'entrollment', 'enrollment'),
      packageType: col(map, 'package type', 'package'),
      noc: col(map, 'noc'),
      payment: col(map, 'payment status'),
      remarks: col(map, 'remarks'),
      f1: col(map, 'follow up 1'),
      f2: col(map, 'follow up 2'),
      f3: col(map, 'follow up 3'),
    };

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const contactRaw = cell(row, ci.contact);
      const name = cell(row, ci.name);
      if (!contactRaw && !name) continue;
      const phone = normalizePhone(contactRaw);
      if (!phone) continue;

      const ageNum = parseInt(cell(row, ci.age), 10);
      const notes = [
        cell(row, ci.remarks),
        combineFollowUps([cell(row, ci.f1), cell(row, ci.f2), cell(row, ci.f3)]),
        cell(row, ci.enrollment) ? `Enrollment: ${cell(row, ci.enrollment)}` : '',
      ].filter(Boolean).join(' | ');

      records.push({
        format: 'meta',
        listType: 'LEAD',
        name: name || null,
        phone,
        phoneRaw: contactRaw || null,
        whatsapp: cell(row, ci.whatsapp) ? normalizePhone(cell(row, ci.whatsapp)) : null,
        age: Number.isFinite(ageNum) ? ageNum : null,
        email: cell(row, ci.email) || null,
        program: normalizeProgram(cell(row, ci.program)),
        location: locationFromFile,
        source: cell(row, ci.source) || null,
        leadStage: normalizeLeadStage(cell(row, ci.leadStage)),
        status: normalizeStatus(cell(row, ci.status) || cell(row, ci.leadStage)),
        paymentStatus: normalizePaymentStatus(cell(row, ci.payment)),
        packageType: cell(row, ci.packageType) || null,
        noc: cell(row, ci.noc) || null,
        inquiryDate: parseExcelDate(rawCell(row, ci.inquiryDate)),
        notes: notes || null,
        sourceFile: filename,
        month: sheetName,
      });
    }
  }
  return records;
}

export function parseWorkbook(workbook, format, meta) {
  if (format === 'renewal') return parseRenewal(workbook, meta);
  if (format === 'followup') return parseFollowup(workbook, meta);
  if (format === 'meta') return parseMeta(workbook, meta);
  return [];
}
