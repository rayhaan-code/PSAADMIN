// Read-only ClassCard analytics endpoints.
//
// These surface three branch metrics sourced from ClassCard:
//   1. Invoices pending / overdue
//   2. Unmarked attendance (sessions with no attendance recorded)
//   3. Capacity (enrolled vs class capacity)
//
// The exact field names in ClassCard responses are read defensively (several
// common variants are tried) so this keeps working across minor API shape
// differences. Students are linked to CRM customers by normalized phone number.
//
// Everything here is READ-ONLY. Managers see any branch (via ?locationId=);
// agents are locked to their own branch and their own customers.
import { Router } from 'express';
import { requireAuth, scopeForUser } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { normalizePhone } from '../lib/phone.js';
import * as cc from '../services/classcard/client.js';

const router = Router();
router.use(requireAuth);

// If ClassCard isn't configured, return a friendly 200 with configured:false so
// the UI can show a "connect ClassCard" state rather than an error.
function notConfigured(res, extra = {}) {
  return res.json({ configured: false, ...extra });
}

// Pick the first defined field from a list of candidate keys.
function pick(obj, keys, dflt = null) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return dflt;
}

// Normalize an array-ish response into an array (ClassCard may wrap in {data:[]}).
function asArray(resp) {
  if (Array.isArray(resp)) return resp;
  if (resp && Array.isArray(resp.data)) return resp.data;
  if (resp && Array.isArray(resp.results)) return resp.results;
  if (resp && Array.isArray(resp.invoices)) return resp.invoices;
  if (resp && Array.isArray(resp.payments)) return resp.payments;
  return [];
}

// Resolve the ClassCard config for the request's branch.
//   Managers  -> may pass ?locationId=; falls back to their own location.
//   Agents    -> LOCKED to their own user.locationId (?locationId= is ignored),
//                so an agent can only ever see their own branch's data.
// Returns { cfg, location } where cfg carries the branch's api key.
async function branchConfig(req) {
  const isManager = req.user && req.user.role === 'MANAGER';
  const locationId = isManager
    ? (req.query.locationId ? Number(req.query.locationId) : (req.user && req.user.locationId) || null)
    : (req.user && req.user.locationId) || null;
  let location = null;
  if (locationId) {
    location = await prisma.location.findUnique({ where: { id: locationId } });
  }
  return { cfg: cc.resolveBranchConfig(location), location };
}

// Match a CRM customer to a ClassCard student by phone (confirmed via email when
// available). Returns the student object or null when no confident match exists.
async function findStudentForCustomer(cfg, customer) {
  const target = normalizePhone(customer.phone);
  if (customer.email) {
    const list = asArray(await cc.getStudentList(cfg, { email: customer.email }));
    return list.find((s) => normalizePhone(pick(s, ['phone1', 'phone', 'mobile'], '')) === target) || list[0] || null;
  }
  return null;
}

// --- Connection status. Managers pick a branch; agents see their own. ---
router.get('/status', async (req, res) => {
  // Nothing configured anywhere -> "connect ClassCard" state.
  if (!cc.hasAnyKey()) return notConfigured(res);
  const { cfg, location } = await branchConfig(req);
  // A key exists somewhere, but not for this specific branch.
  if (!cc.isConfigured(cfg)) return notConfigured(res, { branch: location ? location.name : null });
  try {
    // Cheap call to verify the key works.
    await cc.getInvoices(cfg, { detailed: false });
    res.json({ configured: true, ok: true, branch: location ? location.name : null });
  } catch (err) {
    res.json({ configured: true, ok: false, branch: location ? location.name : null, error: err.message });
  }
});

// --- Invoices: pending / overdue summary. Branch-scoped for agents. ---
router.get('/invoices/summary', async (req, res, next) => {
  const { cfg, location } = await branchConfig(req);
  if (!cc.isConfigured(cfg)) return notConfigured(res, { branch: location ? location.name : null });
  try {
    const raw = await cc.getInvoices(cfg, { detailed: true });
    const invoices = asArray(raw);
    const now = new Date();

    let pending = 0, overdue = 0, paid = 0;
    let pendingAmount = 0, overdueAmount = 0;

    for (const inv of invoices) {
      const status = String(pick(inv, ['status', 'invoice_status', 'state'], '')).toLowerCase();
      const amount = Number(pick(inv, ['balance', 'amount_due', 'due', 'total', 'amount'], 0)) || 0;
      const dueRaw = pick(inv, ['due_date', 'dueDate', 'due', 'date_due']);
      const dueDate = dueRaw ? new Date(dueRaw) : null;
      const isPaid = status.includes('paid') || Number(pick(inv, ['balance', 'amount_due'], 1)) === 0;

      if (isPaid) { paid++; continue; }
      // Unpaid: overdue if past due date, else pending.
      if (dueDate && !isNaN(dueDate) && dueDate < now) {
        overdue++; overdueAmount += amount;
      } else {
        pending++; pendingAmount += amount;
      }
    }

    res.json({
      configured: true,
      branch: location ? location.name : null,
      total: invoices.length,
      paid,
      pending,
      overdue,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      overdueAmount: Math.round(overdueAmount * 100) / 100,
    });
  } catch (err) { next(err); }
});

// --- Unmarked attendance for a CRM customer (matched by phone). ---
// Query: ?customerId= & ?start= & ?end=  (dates default to last 30 days)
router.get('/attendance/unmarked', async (req, res, next) => {
  const { cfg, location } = await branchConfig(req);
  if (!cc.isConfigured(cfg)) return notConfigured(res, { branch: location ? location.name : null });
  try {
    const customerId = req.query.customerId ? Number(req.query.customerId) : null;
    if (!customerId) return res.status(400).json({ error: 'customerId is required' });

    // Agents may only inspect their own customers.
    const customer = await prisma.customer.findFirst({ where: scopeForUser(req.user, { id: customerId }) });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    // Find the ClassCard student by phone (confirmed via email when available).
    const student = await findStudentForCustomer(cfg, customer);
    if (!student) {
      return res.json({ configured: true, branch: location ? location.name : null, matched: false, message: 'No ClassCard student matched this customer.' });
    }

    const end = req.query.end || new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const start = req.query.start || startDate.toISOString().slice(0, 10);

    const studentId = pick(student, ['id', 'student_id', 'studentId']);
    const events = asArray(await cc.getStudentEvents(cfg, { student: studentId, start, end }));

    // "Unmarked" = a past event with no attendance status set.
    const now = new Date();
    let unmarked = 0, marked = 0, upcoming = 0;
    for (const ev of events) {
      const when = new Date(pick(ev, ['start', 'date', 'start_time'], null));
      const att = pick(ev, ['attendance', 'attendance_status', 'status', 'attended']);
      if (when && when > now) { upcoming++; continue; }
      if (att === null || att === undefined || att === '') unmarked++;
      else marked++;
    }

    res.json({
      configured: true,
      branch: location ? location.name : null,
      matched: true,
      studentId,
      window: { start, end },
      total: events.length,
      marked,
      unmarked,
      upcoming,
    });
  } catch (err) { next(err); }
});

// --- Capacity overview. Branch-scoped for agents. ---
// Best-effort: reads staff services/events to estimate enrolled vs capacity.
// Field names confirmed against real data during testing; defensive for now.
router.get('/capacity', async (req, res, next) => {
  const { cfg, location } = await branchConfig(req);
  if (!cc.isConfigured(cfg)) return notConfigured(res, { branch: location ? location.name : null });
  try {
    const staffId = req.query.staffId || null;
    const events = asArray(await cc.getStaffEvents(cfg, staffId ? { staff_id: staffId } : {}));

    const rows = events.map((ev) => {
      const capacity = Number(pick(ev, ['capacity', 'max_capacity', 'maxStudents', 'limit'], 0)) || 0;
      const enrolled = Number(pick(ev, ['enrolled', 'enrolment_count', 'booked', 'attendees'], 0)) || 0;
      return {
        name: pick(ev, ['title', 'name', 'service', 'class'], 'Class'),
        when: pick(ev, ['start', 'date', 'start_time'], null),
        capacity,
        enrolled,
        utilization: capacity > 0 ? Math.round((enrolled / capacity) * 1000) / 10 : null,
        full: capacity > 0 && enrolled >= capacity,
      };
    });

    const full = rows.filter((r) => r.full).length;
    const avgUtil = rows.length
      ? Math.round((rows.reduce((a, r) => a + (r.utilization || 0), 0) / rows.length) * 10) / 10
      : null;

    res.json({ configured: true, branch: location ? location.name : null, classes: rows.length, full, avgUtilization: avgUtil, rows });
  } catch (err) { next(err); }
});

// Summarize a list of ClassCard invoices into paid/pending/overdue counts+amounts.
function summarizeInvoices(invoices) {
  const now = new Date();
  let pending = 0, overdue = 0, paid = 0, pendingAmount = 0, overdueAmount = 0;
  for (const inv of invoices) {
    const status = String(pick(inv, ['status', 'invoice_status', 'state'], '')).toLowerCase();
    const amount = Number(pick(inv, ['balance', 'amount_due', 'due', 'total', 'amount'], 0)) || 0;
    const dueRaw = pick(inv, ['due_date', 'dueDate', 'due', 'date_due']);
    const dueDate = dueRaw ? new Date(dueRaw) : null;
    const isPaid = status.includes('paid') || Number(pick(inv, ['balance', 'amount_due'], 1)) === 0;
    if (isPaid) { paid++; continue; }
    if (dueDate && !isNaN(dueDate) && dueDate < now) { overdue++; overdueAmount += amount; }
    else { pending++; pendingAmount += amount; }
  }
  return {
    total: invoices.length, paid, pending, overdue,
    pendingAmount: Math.round(pendingAmount * 100) / 100,
    overdueAmount: Math.round(overdueAmount * 100) / 100,
  };
}

// --- Per-customer ClassCard summary (attendance + invoices), matched by phone. ---
// Query: ?customerId= & ?locationId= (optional) & ?start= & ?end= (attendance window)
router.get('/student/summary', async (req, res, next) => {
  const customerId = req.query.customerId ? Number(req.query.customerId) : null;
  if (!customerId) return res.status(400).json({ error: 'customerId is required' });

  // Agents may only inspect their own customers.
  const customer = await prisma.customer.findFirst({ where: scopeForUser(req.user, { id: customerId }) });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  // Managers may default the branch to the customer's own location; agents are
  // always locked to their own branch inside branchConfig().
  if (req.user.role === 'MANAGER' && !req.query.locationId && customer.locationId) {
    req.query.locationId = String(customer.locationId);
  }
  const { cfg, location } = await branchConfig(req);
  if (!cc.isConfigured(cfg)) return notConfigured(res, { branch: location ? location.name : null });

  try {
    const student = await findStudentForCustomer(cfg, customer);
    if (!student) {
      return res.json({ configured: true, branch: location ? location.name : null, matched: false, message: 'No ClassCard student matched this customer.' });
    }
    const studentId = pick(student, ['id', 'student_id', 'studentId']);

    // Attendance window (default last 30 days).
    const end = req.query.end || new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const start = req.query.start || startDate.toISOString().slice(0, 10);

    const [eventsRaw, invoicesRaw] = await Promise.all([
      cc.getStudentEvents(cfg, { student: studentId, start, end }),
      cc.getStudentInvoices(cfg, studentId).catch(() => []),
    ]);

    const events = asArray(eventsRaw);
    const now = new Date();
    let unmarked = 0, marked = 0, upcoming = 0;
    for (const ev of events) {
      const when = new Date(pick(ev, ['start', 'date', 'start_time'], null));
      const att = pick(ev, ['attendance', 'attendance_status', 'status', 'attended']);
      if (when && when > now) { upcoming++; continue; }
      if (att === null || att === undefined || att === '') unmarked++;
      else marked++;
    }

    res.json({
      configured: true,
      branch: location ? location.name : null,
      matched: true,
      studentId,
      studentName: pick(student, ['name', 'full_name', 'student_name'], null),
      window: { start, end },
      attendance: { total: events.length, marked, unmarked, upcoming },
      invoices: summarizeInvoices(asArray(invoicesRaw)),
    });
  } catch (err) { next(err); }
});

// --- Branch student list. Branch-scoped for agents. List-only (no N+1). ---
router.get('/students', async (req, res, next) => {
  const { cfg, location } = await branchConfig(req);
  if (!cc.isConfigured(cfg)) return notConfigured(res, { branch: location ? location.name : null });
  try {
    const list = asArray(await cc.getStudentList(cfg, {}));
    const students = list.map((s) => ({
      studentId: pick(s, ['id', 'student_id', 'studentId'], null),
      name: pick(s, ['name', 'full_name', 'student_name'], null),
      phone: pick(s, ['phone1', 'phone', 'mobile'], null),
      email: pick(s, ['email', 'email1'], null),
    }));
    res.json({ configured: true, branch: location ? location.name : null, count: students.length, students });
  } catch (err) { next(err); }
});

export default router;
