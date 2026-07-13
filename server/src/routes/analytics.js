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

export default router;
