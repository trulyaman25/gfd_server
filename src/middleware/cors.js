/* ============================================================================
 *  CORS, allowlist only.
 *
 *  No `cors` package: the policy is short enough to read in one screen, and
 *  being able to see exactly which origins are reflected is the whole point.
 *
 *  Requests with no Origin header (curl, server-to-server, same-origin form
 *  posts) are left alone. CORS is a browser mechanism; there is nothing to
 *  enforce when there is no browser.
 * ========================================================================== */

import { config } from '../config.js';

export function cors(req, res, next) {
  const origin = req.headers.origin;

  if (!origin) return next();

  const allowed = config.allowedOrigins.includes(origin.replace(/\/$/, ''));
  const allowAll = config.allowedOrigins.length === 0;

  if (allowed || allowAll) {
    res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin);
    /* The allowlist is per-origin, so caches must key on Origin or one visitor's
     * response could be replayed to another. */
    if (!allowAll) {
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') {
    /* An unlisted origin gets a plain 204 with no allow headers, which the
     * browser then refuses. Answering 403 here would leak the allowlist. */
    return res.status(204).end();
  }

  return next();
}
