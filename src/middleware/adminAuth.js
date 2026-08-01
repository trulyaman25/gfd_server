/* ============================================================================
 *  The gate on reading attempts back.
 *
 *  Her typed answers are behind this. Two decisions worth stating plainly:
 *
 *  1. No token configured means the route is OFF, not open. A read endpoint that
 *     quietly becomes public when a variable is missing is how this kind of data
 *     leaks, and "it worked without the token" is not a signal anyone notices.
 *
 *  2. The comparison is constant time. Comparing with === leaks the length of the
 *     matching prefix through timing, which is enough to recover a token one
 *     character at a time.
 * ========================================================================== */

import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

function sameToken(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  /* timingSafeEqual throws on a length mismatch, and the lengths themselves are
   * not the secret, so check them first. */
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function adminAuth(req, res, next) {
  if (!config.adminToken) {
    return res.status(503).json({
      error: 'reading is disabled',
      hint: 'Set ADMIN_TOKEN in .env and restart to enable this endpoint.',
    });
  }

  /* Header first; the query string is the convenient one for a browser, and it
   * ends up in server logs and history, so it is the fallback rather than the
   * documented path. */
  const provided =
    req.headers['x-admin-token'] ??
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined) ??
    req.query.token;

  if (!provided || !sameToken(provided, config.adminToken)) {
    return res.status(401).json({ error: 'unauthorised' });
  }

  /* Nothing behind this gate should ever be cached or indexed. */
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  return next();
}
