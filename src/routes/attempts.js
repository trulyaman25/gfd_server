/* ============================================================================
 *  /api/quiz-attempt   POST  record one attempt        (public, rate limited)
 *  /api/quiz-attempts  GET   read them back            (ADMIN_TOKEN required)
 *  /api/quiz-attempts/summary GET  counts only         (ADMIN_TOKEN required)
 * ========================================================================== */

import express from 'express';
import { Attempt } from '../models/Attempt.js';
import { sanitizeAttempt } from '../lib/sanitize.js';
import { clientIp, hashIp, userAgent } from '../lib/clientMeta.js';
import { isReady } from '../db.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const attemptsRouter = express.Router();

/* ------------------------------------------------------------------ write ---*/
attemptsRouter.post('/quiz-attempt', rateLimit, async (req, res) => {
  const parsed = sanitizeAttempt(req.body);

  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  /* Buffering is off, so writing while disconnected would throw. Say so plainly
   * instead: the site treats any failure here as "never mind" anyway. */
  if (!isReady()) {
    return res.status(503).json({ error: 'database unavailable' });
  }

  try {
    const saved = await Attempt.create({
      ...parsed.value,
      client: {
        ...parsed.value.client,
        userAgent: userAgent(req),
      },
      ipHash: hashIp(clientIp(req)),
    });

    /* The id and nothing else. This response goes to whoever posted, which is not
     * necessarily her, so it must not echo the attempt back. */
    return res.status(201).json({ ok: true, id: saved._id });
  } catch (error) {
    console.error(`  Could not save attempt: ${error.message}`);
    return res.status(500).json({ error: 'could not save' });
  }
});

/* ------------------------------------------------------------------- read ---*/
attemptsRouter.get('/quiz-attempts', adminAuth, async (req, res) => {
  if (!isReady()) {
    return res.status(503).json({ error: 'database unavailable' });
  }

  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const verdict = typeof req.query.verdict === 'string' ? req.query.verdict : null;

  /* Only ever build the filter from values we recognise. */
  const filter = {};
  if (verdict && ['girlfriend', 'unsure', 'friend'].includes(verdict)) {
    filter.verdict = verdict;
  }

  try {
    const [records, total] = await Promise.all([
      Attempt.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Attempt.countDocuments(filter),
    ]);

    return res.json({ total, returned: records.length, records });
  } catch (error) {
    console.error(`  Could not read attempts: ${error.message}`);
    return res.status(500).json({ error: 'could not read' });
  }
});

/* Counts only, for a quick "has she opened it yet" check without pulling her
 * answers out of the database to find out. */
attemptsRouter.get('/quiz-attempts/summary', adminAuth, async (req, res) => {
  if (!isReady()) {
    return res.status(503).json({ error: 'database unavailable' });
  }

  try {
    const [byVerdict, total, latest] = await Promise.all([
      Attempt.aggregate([
        { $group: { _id: '$verdict', count: { $sum: 1 }, avgConfidence: { $avg: '$confidence' } } },
      ]),
      Attempt.countDocuments(),
      Attempt.findOne().sort({ createdAt: -1 }).select('verdict confidence createdAt').lean(),
    ]);

    const verdicts = {};
    for (const row of byVerdict) {
      verdicts[row._id] = {
        count: row.count,
        avgConfidence: Math.round((row.avgConfidence ?? 0) * 1000) / 1000,
      };
    }

    return res.json({ total, verdicts, latest });
  } catch (error) {
    console.error(`  Could not summarise attempts: ${error.message}`);
    return res.status(500).json({ error: 'could not read' });
  }
});
