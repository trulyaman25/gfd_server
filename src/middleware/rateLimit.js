/* ============================================================================
 *  A fixed-window rate limit, in memory.
 *
 *  Enough to stop someone holding down refresh and filling the collection. It is
 *  per-process and resets on restart, which is the right trade for one small
 *  server; a shared store would be the answer if this ever ran on more than one
 *  instance.
 * ========================================================================== */

import { config } from '../config.js';
import { clientIp } from '../lib/clientMeta.js';

const hits = new Map(); // ip -> { count, windowStart }

/* Without this the map grows once per unique address, forever. */
const SWEEP_EVERY_MS = 5 * 60_000;

const sweeper = setInterval(() => {
  const cutoff = Date.now() - config.rateLimit.windowMs;
  for (const [ip, entry] of hits) {
    if (entry.windowStart < cutoff) hits.delete(ip);
  }
}, SWEEP_EVERY_MS);

/* Do not hold the process open just for the sweeper. */
sweeper.unref?.();

export function rateLimit(req, res, next) {
  const { windowMs, maxPerWindow } = config.rateLimit;
  const now = Date.now();
  const ip = clientIp(req);
  const entry = hits.get(ip);

  if (!entry || now - entry.windowStart >= windowMs) {
    hits.set(ip, { count: 1, windowStart: now });
    return next();
  }

  entry.count += 1;

  if (entry.count > maxPerWindow) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
    return res.status(429).json({ error: 'too many requests' });
  }

  return next();
}
