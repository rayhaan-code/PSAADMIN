import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { importWorkbookBuffer } from '../services/import/index.js';
import { prisma } from '../lib/prisma.js';
import { dateRangeFilter } from '../lib/date.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Upload one or more Excel files. Auto-detects each file's format.
router.post('/', requireAuth, requireManager, upload.array('files', 30), async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  // Optional: assign every imported customer to a specific user (overrides sheet agent).
  let assignToUserId = null;
  if (req.body.assignToUserId) {
    assignToUserId = Number(req.body.assignToUserId);
    const target = await prisma.user.findUnique({ where: { id: assignToUserId } });
    if (!target) return res.status(400).json({ error: 'Selected user to assign to was not found' });
  }

  const results = [];
  for (const file of req.files) {
    try {
      const summary = await importWorkbookBuffer(file.buffer, file.originalname, { createdById: req.user.id, assignToUserId });
      results.push({ ok: true, ...summary });
    } catch (err) {
      results.push({ ok: false, filename: file.originalname, error: err.message });
    }
  }
  res.json({ results });
});

// History of import batches.
router.get('/batches', requireAuth, requireManager, async (req, res) => {
  const range = dateRangeFilter(req.query.start, req.query.end);
  const batches = await prisma.importBatch.findMany({
    where: range ? { createdAt: range } : {},
    include: { location: true, createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(batches);
});

export default router;
