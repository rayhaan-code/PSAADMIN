import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, scopeForUser } from '../middleware/auth.js';
import { startOfToday, addDays, dateRangeFilter } from '../lib/date.js';

const router = Router();
router.use(requireAuth);

// "Who to call today" — renewals due soon, follow-ups due/overdue, review-flagged.
router.get('/today', async (req, res) => {
  const windowDays = Number(req.query.windowDays) || 7;
  const today = startOfToday();
  const soon = addDays(today, windowDays);

  // Optional manager filters
  const baseExtra = {};
  if (req.query.locationId) baseExtra.locationId = Number(req.query.locationId);
  if (req.query.agentId && req.user.role === 'MANAGER') baseExtra.assignedAgentId = Number(req.query.agentId);

  const scope = scopeForUser(req.user, baseExtra);

  const [followUpsDue, renewalsDue, reviewFlagged] = await Promise.all([
    prisma.customer.findMany({
      where: { ...scope, nextFollowUpDate: { lte: today }, needsManagerReview: false },
      include: { assignedAgent: { select: { id: true, name: true } }, location: true },
      orderBy: { nextFollowUpDate: 'asc' },
      take: 200,
    }),
    prisma.customer.findMany({
      where: { ...scope, renewalDate: { gte: today, lte: soon }, listType: 'RENEWAL' },
      include: { assignedAgent: { select: { id: true, name: true } }, location: true },
      orderBy: { renewalDate: 'asc' },
      take: 200,
    }),
    prisma.customer.findMany({
      where: { ...scope, needsManagerReview: true },
      include: { assignedAgent: { select: { id: true, name: true } }, location: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
  ]);

  res.json({ followUpsDue, renewalsDue, reviewFlagged, windowDays });
});

// Summary counts for the top of the dashboard.
// A date range (start/end) scopes the "created in period" KPIs (total/leads/
// renewals/followups). The operational counts (dueToday/review) are always live.
router.get('/stats', async (req, res) => {
  const scope = scopeForUser(req.user, {});
  const today = startOfToday();

  const range = dateRangeFilter(req.query.start, req.query.end);
  const scoped = range ? { ...scope, createdAt: range } : scope;

  const [total, leads, renewals, followups, dueToday, review] = await Promise.all([
    prisma.customer.count({ where: scoped }),
    prisma.customer.count({ where: { ...scoped, listType: 'LEAD' } }),
    prisma.customer.count({ where: { ...scoped, listType: 'RENEWAL' } }),
    prisma.customer.count({ where: { ...scoped, listType: 'FOLLOW_UP' } }),
    prisma.customer.count({ where: { ...scope, nextFollowUpDate: { lte: today } } }),
    prisma.customer.count({ where: { ...scope, needsManagerReview: true } }),
  ]);

  res.json({ total, leads, renewals, followups, dueToday, review });
});

export default router;
