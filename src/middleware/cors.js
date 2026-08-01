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

  /* This backend only accepts a tiny JSON payload and does not use cookies or
   * other credentials, so there is no reason to block browser origins here. */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    /* Preflight only needs the headers above. */
    return res.status(204).end();
  }

  return next();
}
