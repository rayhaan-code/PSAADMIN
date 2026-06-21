import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, scopeForUser } from '../middleware/auth.js';
import { nextFollowUp, parseExcelDate } from '../lib/date.js';
import { normalizePhone } from '../lib/phone.js';
import { STATUS_OPTIONS, PAYMENT_STATUS_OPTIONS, LEAD_STAGE_OPTIONS } from '../lib/mappings.js';

const router = Router();
router.use(requireAuth);

// Dropdown option values for the client.
router.get('/options', (req, res) => {
  res.json({
    status: STATUS_OPTIONS,
    paymentStatus: PAYMENT_STATUS_OPTIONS,
    leadStage: LEAD_STAGE_OPTIONS,
    listType: ['RENEWAL', 'LEAD', 'FOLLOW_UP', 'TRIAL', 'UNSCHEDULED'],
  });
});

// List with filters + pagination. Agents are scoped to their own customers.
router.get('/', async (req, res) => {
  const { q, listType, status, locationId, agentId, program, review, page = 1, pageSize = 50 } = req.query;
  const where = scopeForUser(req.user, {});

  if (listType) where.listType = listType;
  if (status) where.status = status;
  if (program) where.program = program;
  if (review === 'true') where.needsManagerReview = true;
  if (locationId) where.locationId = Number(locationId);
  // Managers can filter by a specific agent
  if (agentId && req.user.role === 'MANAGER') where.assignedAgentId = Number(agentId);
  if (q) {
    where.OR = [
      { name: { contains: String(q), mode: 'insensitive' } },
      { phone: { contains: normalizePhone(q) || String(q) } },
      { email: { contains: String(q), mode: 'insensitive' } },
    ];
  }

  const take = Math.min(Number(pageSize) || 50, 200);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const [total, items] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      include: { location: true, assignedAgent: { select: { id: true, name: true } } },
      orderBy: [{ nextFollowUpDate: 'asc' }, { updatedAt: 'desc' }],
      skip,
      take,
    }),
  ]);

  res.json({ total, page: Number(page), pageSize: take, items });
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const where = scopeForUser(req.user, { id });
  const customer = await prisma.customer.findFirst({
    where,
    include: {
      location: true,
      assignedAgent: { select: { id: true, name: true } },
      activities: { orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
});

// Create a new lead manually.
router.post('/', async (req, res) => {
  const b = req.body || {};
  const phone = normalizePhone(b.phone);
  if (!phone) return res.status(400).json({ error: 'A valid phone number is required' });

  // Agents create leads assigned to themselves; managers can assign anyone.
  const assignedAgentId = req.user.role === 'MANAGER' ? (b.assignedAgentId ? Number(b.assignedAgentId) : null) : req.user.id;

  const customer = await prisma.customer.create({
    data: {
      name: b.name || null,
      phone,
      phoneRaw: b.phone || null,
      whatsapp: b.whatsapp ? normalizePhone(b.whatsapp) : null,
      email: b.email || null,
      age: b.age ? Number(b.age) : null,
      program: b.program || 'General',
      activity: b.activity || null,
      listType: b.listType || 'LEAD',
      locationId: b.locationId ? Number(b.locationId) : (req.user.locationId || null),
      assignedAgentId,
      status: b.status || 'Pending',
      source: b.source || 'Manual',
      nextFollowUpDate: b.nextFollowUpDate ? parseExcelDate(b.nextFollowUpDate) : null,
      notes: b.notes || null,
    },
  });

  await prisma.activity.create({
    data: { customerId: customer.id, userId: req.user.id, type: 'LEAD_CREATED', detail: 'Lead created manually' },
  });

  res.status(201).json(customer);
});

// Update fields (status, assignment, notes, dates, etc.).
router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.customer.findFirst({ where: scopeForUser(req.user, { id }) });
  if (!existing) return res.status(404).json({ error: 'Customer not found' });

  const b = req.body || {};
  const data = {};
  const activityLogs = [];

  if (b.status !== undefined && b.status !== existing.status) {
    data.status = b.status;
    activityLogs.push({ type: 'STATUS_CHANGE', detail: `Status: ${existing.status || '—'} -> ${b.status}` });
  }
  if (b.paymentStatus !== undefined) data.paymentStatus = b.paymentStatus;
  if (b.leadStage !== undefined) data.leadStage = b.leadStage;
  if (b.listType !== undefined) data.listType = b.listType;
  if (b.name !== undefined) data.name = b.name;
  if (b.email !== undefined) data.email = b.email;
  if (b.notes !== undefined) data.notes = b.notes;
  if (b.nextFollowUpDate !== undefined) data.nextFollowUpDate = b.nextFollowUpDate ? parseExcelDate(b.nextFollowUpDate) : null;
  if (b.renewalDate !== undefined) data.renewalDate = b.renewalDate ? parseExcelDate(b.renewalDate) : null;
  if (b.needsManagerReview !== undefined) data.needsManagerReview = !!b.needsManagerReview;

  // Reassignment (manager only)
  if (b.assignedAgentId !== undefined && req.user.role === 'MANAGER') {
    data.assignedAgentId = b.assignedAgentId ? Number(b.assignedAgentId) : null;
    activityLogs.push({ type: 'ASSIGNED', detail: `Reassigned to agent #${b.assignedAgentId}` });
  }

  const updated = await prisma.customer.update({ where: { id }, data });
  for (const log of activityLogs) {
    await prisma.activity.create({ data: { customerId: id, userId: req.user.id, ...log } });
  }
  res.json(updated);
});

// Log a follow-up: advances the stage and sets the next date (+2, +5, then review).
router.post('/:id/follow-up', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.customer.findFirst({ where: scopeForUser(req.user, { id }) });
  if (!existing) return res.status(404).json({ error: 'Customer not found' });

  const { stage, nextDate, needsManagerReview } = nextFollowUp(existing.followUpStage);
  const note = (req.body && req.body.note) || '';

  const updated = await prisma.customer.update({
    where: { id },
    data: { followUpStage: stage, nextFollowUpDate: nextDate, needsManagerReview },
  });

  const detail = needsManagerReview
    ? `Follow-up stage ${stage} logged — flagged for manager review${note ? `: ${note}` : ''}`
    : `Follow-up stage ${stage} logged — next on ${nextDate?.toISOString().slice(0, 10)}${note ? `: ${note}` : ''}`;
  await prisma.activity.create({ data: { customerId: id, userId: req.user.id, type: 'FOLLOW_UP', detail } });

  res.json(updated);
});

// Log a call or a note.
router.post('/:id/activity', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.customer.findFirst({ where: scopeForUser(req.user, { id }) });
  if (!existing) return res.status(404).json({ error: 'Customer not found' });

  const { type = 'NOTE', detail = '' } = req.body || {};
  const allowed = ['CALL', 'NOTE'];
  if (!allowed.includes(type)) return res.status(400).json({ error: 'Invalid activity type' });

  const activity = await prisma.activity.create({
    data: { customerId: id, userId: req.user.id, type, detail },
  });
  await prisma.customer.update({ where: { id }, data: { updatedAt: new Date() } });
  res.status(201).json(activity);
});

export default router;
