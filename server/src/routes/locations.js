import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireManager } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const locations = await prisma.location.findMany({
    include: { _count: { select: { customers: true, users: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(
    locations.map((l) => ({ id: l.id, name: l.name, customerCount: l._count.customers, userCount: l._count.users }))
  );
});

router.post('/', requireManager, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const loc = await prisma.location.upsert({ where: { name }, update: {}, create: { name } });
  res.status(201).json(loc);
});

export default router;
