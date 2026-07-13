// Read-only analytics endpoints. No schema changes; pure aggregation over existing data.
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, scopeForUser } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Retention = Renewed ÷ (Renewed + Not Renewing), among RENEWAL-list customers.
// "Renewed" = paymentStatus Paid; "Not Renewing" = paymentStatus 'Not Renewing'.
// Managers may filter by locationId / agentId; agents are auto-scoped to themselves.
router.get('/retention', async (req, res) => {
  const extra = { listType: 'RENEWAL' };
  if (req.query.locationId) extra.locationId = Number(req.query.locationId);
  if (req.query.agentId && req.user.role === 'MANAGER') extra.assignedAgentId = Number(req.query.agentId);
  const scope = scopeForUser(req.user, extra);

  const [renewed, notRenewing, pending, overdue, totalRenewal] = await Promise.all([
    prisma.customer.count({ where: { ...scope, paymentStatus: 'Paid' } }),
    prisma.customer.count({ where: { ...scope, paymentStatus: 'Not Renewing' } }),
    prisma.customer.count({ where: { ...scope, paymentStatus: 'Pending' } }),
    prisma.customer.count({ where: { ...scope, paymentStatus: 'Overdue' } }),
    prisma.customer.count({ where: scope }),
  ]);

  const denom = renewed + notRenewing;
  const retentionRate = denom > 0 ? Math.round((renewed / denom) * 1000) / 10 : null;

  res.json({
    retentionRate, // percent, e.g. 82.5 — or null if no data
    renewed,
    notRenewing,
    pending,
    overdue,
    totalRenewal,
  });
});

// --- Shared helper: compute a KPI summary for a given Prisma "where" scope. ---
async function summaryFor(scope) {
  const renewalScope = { ...scope, listType: 'RENEWAL' };
  const [
    total, leads, renewals, followups,
    renewed, notRenewing, pending, overdue,
    won, review,
  ] = await Promise.all([
    prisma.customer.count({ where: scope }),
    prisma.customer.count({ where: { ...scope, listType: 'LEAD' } }),
    prisma.customer.count({ where: { ...scope, listType: 'RENEWAL' } }),
    prisma.customer.count({ where: { ...scope, listType: 'FOLLOW_UP' } }),
    prisma.customer.count({ where: { ...renewalScope, paymentStatus: 'Paid' } }),
    prisma.customer.count({ where: { ...renewalScope, paymentStatus: 'Not Renewing' } }),
    prisma.customer.count({ where: { ...renewalScope, paymentStatus: 'Pending' } }),
    prisma.customer.count({ where: { ...renewalScope, paymentStatus: 'Overdue' } }),
    prisma.customer.count({ where: { ...scope, status: 'Won/Enrolled' } }),
    prisma.customer.count({ where: { ...scope, needsManagerReview: true } }),
  ]);
  const denom = renewed + notRenewing;
  const retentionRate = denom > 0 ? Math.round((renewed / denom) * 1000) / 10 : null;
  return {
    total, leads, renewals, followups,
    retentionRate, renewed, notRenewing, pending, overdue,
    won, review,
  };
}

// --- Branch view: KPIs for one location + per-agent leaderboard within it. ---
// Managers only (agents can't view a whole branch). Requires ?locationId=
router.get('/branch', async (req, res) => {
  if (req.user.role !== 'MANAGER') return res.status(403).json({ error: 'Manager access required' });
  const locationId = req.query.locationId ? Number(req.query.locationId) : null;
  if (!locationId) return res.status(400).json({ error: 'locationId is required' });

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) return res.status(404).json({ error: 'Location not found' });

  const summary = await summaryFor({ locationId });

  // Per-agent leaderboard: customers assigned to each agent within this branch.
  const grouped = await prisma.customer.groupBy({
    by: ['assignedAgentId'],
    where: { locationId },
    _count: { _all: true },
  });
  const agentIds = grouped.map((g) => g.assignedAgentId).filter((x) => x != null);
  const agents = agentIds.length
    ? await prisma.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(agents.map((a) => [a.id, a.name]));
  const leaderboard = grouped
    .map((g) => ({
      agentId: g.assignedAgentId,
      name: g.assignedAgentId ? (nameById.get(g.assignedAgentId) || `#${g.assignedAgentId}`) : 'Unassigned',
      customers: g._count._all,
    }))
    .sort((a, b) => b.customers - a.customers);

  res.json({ location: { id: location.id, name: location.name }, summary, leaderboard });
});

// --- User view: KPIs for one agent. Managers can view anyone via ?userId=;
//     agents can only view themselves. ---
router.get('/user', async (req, res) => {
  let targetId = req.user.id;
  if (req.query.userId) {
    const requested = Number(req.query.userId);
    if (req.user.role !== 'MANAGER' && requested !== req.user.id) {
      return res.status(403).json({ error: 'You can only view your own stats' });
    }
    targetId = requested;
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { location: true },
  });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const scope = { assignedAgentId: targetId };
  const summary = await summaryFor(scope);

  // Follow-ups due/overdue for this user + recent activity count.
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const [dueToday, activityCount] = await Promise.all([
    prisma.customer.count({ where: { ...scope, nextFollowUpDate: { lte: now } } }),
    prisma.activity.count({ where: { userId: targetId } }),
  ]);

  res.json({
    user: { id: target.id, name: target.name, role: target.role, location: target.location?.name || null },
    summary,
    dueToday,
    activityCount,
  });
});

// --- Branches overview: quick KPI list across all locations (managers only). ---
router.get('/branches', async (req, res) => {
  if (req.user.role !== 'MANAGER') return res.status(403).json({ error: 'Manager access required' });
  const locations = await prisma.location.findMany({ orderBy: { name: 'asc' } });
  const rows = [];
  for (const loc of locations) {
    const summary = await summaryFor({ locationId: loc.id });
    rows.push({ id: loc.id, name: loc.name, ...summary });
  }
  res.json(rows);
});

export default router;
