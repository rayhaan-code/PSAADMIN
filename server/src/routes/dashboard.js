import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, scopeForUser } from '../middleware/auth.js';
import { startOfToday, addDays, dateRangeFilter } from '../lib/date.js';

const router = Router();
router.use(requireAuth);

// Scope for "calls logged today": agents see their own; managers see all, or a
// single agent (?agentId=) / branch (?locationId=) when filtered.
function callScope(req) {
  if (req.user.role !== 'MANAGER') return { userId: req.user.id };
  if (req.query.agentId) return { userId: Number(req.query.agentId) };
  if (req.query.locationId) return { user: { locationId: Number(req.query.locationId) } };
  return {};
}

// Daily task board — follow-ups and renewals bucketed by day window:
// Today (incl. overdue) / Tomorrow / Next 7 days / Total outstanding, plus the
// count of calls logged today and the manager review-flagged list.
router.get('/today', async (req, res) => {
  const today = startOfToday();
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 2);
  const next7End = addDays(today, 8);

  // Optional manager filters
  const baseExtra = {};
  if (req.query.locationId) baseExtra.locationId = Number(req.query.locationId);
  if (req.query.agentId && req.user.role === 'MANAGER') baseExtra.assignedAgentId = Number(req.query.agentId);

  const scope = scopeForUser(req.user, baseExtra);
  const listInclude = { assignedAgent: { select: { id: true, name: true } }, location: true };

  // Where-clause builders per bucket.
  const followUp = (dateFilter) => ({ ...scope, needsManagerReview: false, nextFollowUpDate: dateFilter });
  const renewal = (dateFilter) => ({ ...scope, listType: 'RENEWAL', renewalDate: dateFilter });

  const [
    todayFollowUps, todayRenewals,
    tomorrowFollowUps, tomorrowRenewals,
    next7FollowUpCount, next7RenewalCount,
    totalFollowUpCount, totalRenewalCount,
    reviewFlagged,
    callsToday,
  ] = await Promise.all([
    // Today (includes overdue): due before tomorrow.
    prisma.customer.findMany({ where: followUp({ lt: tomorrow }), include: listInclude, orderBy: { nextFollowUpDate: 'asc' }, take: 200 }),
    prisma.customer.findMany({ where: renewal({ lt: tomorrow }), include: listInclude, orderBy: { renewalDate: 'asc' }, take: 200 }),
    // Tomorrow (that calendar day only).
    prisma.customer.findMany({ where: followUp({ gte: tomorrow, lt: dayAfter }), include: listInclude, orderBy: { nextFollowUpDate: 'asc' }, take: 200 }),
    prisma.customer.findMany({ where: renewal({ gte: tomorrow, lt: dayAfter }), include: listInclude, orderBy: { renewalDate: 'asc' }, take: 200 }),
    // Next 7 days (tomorrow .. today+7).
    prisma.customer.count({ where: followUp({ gte: tomorrow, lt: next7End }) }),
    prisma.customer.count({ where: renewal({ gte: tomorrow, lt: next7End }) }),
    // Total outstanding (any date set).
    prisma.customer.count({ where: followUp({ not: null }) }),
    prisma.customer.count({ where: renewal({ not: null }) }),
    // Manager review-flagged (unchanged behaviour).
    prisma.customer.findMany({ where: { ...scope, needsManagerReview: true }, include: listInclude, orderBy: { updatedAt: 'desc' }, take: 200 }),
    // Calls logged today, scoped to the caller.
    prisma.activity.count({ where: { type: 'CALL', createdAt: { gte: today, lt: tomorrow }, ...callScope(req) } }),
  ]);

  res.json({
    today: { followUps: todayFollowUps, renewals: todayRenewals },
    tomorrow: { followUps: tomorrowFollowUps, renewals: tomorrowRenewals },
    next7: { followUpCount: next7FollowUpCount, renewalCount: next7RenewalCount },
    total: { followUpCount: totalFollowUpCount, renewalCount: totalRenewalCount },
    reviewFlagged,
    callsToday,
  });
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
