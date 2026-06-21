import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, locationId: user.locationId },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireManager(req, res, next) {
  if (req.user?.role !== 'MANAGER') {
    return res.status(403).json({ error: 'Manager access required' });
  }
  next();
}

// Helper: build a Prisma "where" scope so agents only see their own customers.
export function scopeForUser(user, extra = {}) {
  if (user.role === 'MANAGER') return { ...extra };
  return { ...extra, assignedAgentId: user.id };
}
