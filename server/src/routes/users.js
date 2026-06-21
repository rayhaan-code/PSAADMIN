import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireManager } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// List users. Agents get a lightweight list (for nothing sensitive); managers get full.
router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    include: { location: true, _count: { select: { customers: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      location: u.location?.name || null,
      locationId: u.locationId,
      active: u.active,
      customerCount: u._count.customers,
    }))
  );
});

// Create a user (manager only).
router.post('/', requireManager, async (req, res) => {
  const { name, email, password, role = 'AGENT', locationId } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (exists) return res.status(409).json({ error: 'Email already in use' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase().trim(),
      passwordHash,
      role: role === 'MANAGER' ? 'MANAGER' : 'AGENT',
      locationId: locationId ? Number(locationId) : null,
    },
  });
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

// Update user (manager only): role, location, active, password reset.
router.patch('/:id', requireManager, async (req, res) => {
  const id = Number(req.params.id);
  const { name, role, locationId, active, newPassword } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role === 'MANAGER' ? 'MANAGER' : 'AGENT';
  if (locationId !== undefined) data.locationId = locationId ? Number(locationId) : null;
  if (active !== undefined) data.active = !!active;
  if (newPassword) data.passwordHash = await bcrypt.hash(newPassword, 10);
  const user = await prisma.user.update({ where: { id }, data });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active });
});

export default router;
