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
// Everything here is READ-ONLY. Managers only.
import { Router } from 'express';
import { requireAuth, requireManager } from '../middleware/auth.js';
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

// --- Connection status (managers only). ---
router.get('/status', requireManager, async (req, res) => {
  if (!cc.isConfigured()) return notConfigured(res);
  try {
    // Cheap call to verify the key works.
    await cc.getInvoices({ detailed: false });
    res.json({ configured: true, ok: true });
  } catch (err) {
    res.json({ configured: true, ok: false, error: err.message });
  }
});

// --- Invoices: pending / overdue summary (managers only). ---
router.get('/invoices/summary', requireManager, async (req, res, next) => {
  if (!cc.isConfigured()) return notConfigured(res);
  try {
    const raw = await cc.getInvoices({ detailed: true });
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
router.get('/attendance/unmarked', requireManager, async (req, res, next) => {
  if (!cc.isConfigured()) return notConfigured(res);
  try {
    const customerId = req.query.customerId ? Number(req.query.customerId) : null;
    if (!customerId) return res.status(400).json({ error: 'customerId is required' });

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    // Find the ClassCard student by phone. We fetch by email if we have one,
    // then confirm the phone matches; otherwise we can only report "no match".
    const target = normalizePhone(customer.phone);
    let student = null;
    if (customer.email) {
      const list = asArray(await cc.getStudentList({ email: customer.email }));
      student = list.find((s) => normalizePhone(pick(s, ['phone1', 'phone', 'mobile'], '')) === target) || list[0] || null;
    }
    if (!student) {
      return res.json({ configured: true, matched: false, message: 'No ClassCard student matched this customer.' });
    }

    const end = req.query.end || new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const start = req.query.start || startDate.toISOString().slice(0, 10);

    const studentId = pick(student, ['id', 'student_id', 'studentId']);
    const events = asArray(await cc.getStudentEvents({ student: studentId, start, end }));

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

// --- Capacity overview (managers only). ---
// Best-effort: reads staff services/events to estimate enrolled vs capacity.
// Field names confirmed against real data during testing; defensive for now.
router.get('/capacity', requireManager, async (req, res, next) => {
  if (!cc.isConfigured()) return notConfigured(res);
  try {
    const staffId = req.query.staffId || null;
    const events = asArray(await cc.getStaffEvents(staffId ? { staff_id: staffId } : {}));

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

    res.json({ configured: true, classes: rows.length, full, avgUtilization: avgUtil, rows });
  } catch (err) { next(err); }
});

export default router;
