/* ============================================================================
 *  What we take from the request itself, rather than from its body.
 * ========================================================================== */

import { createHash } from 'node:crypto';
import { config } from '../config.js';

/**
 * The caller's address, as far as it can be trusted.
 *
 * Behind a proxy (Render, Fly, nginx) the real address is in x-forwarded-for.
 * That header is trivially forged, which is fine for the two things it is used
 * for here — a coarse rate limit and a salted hash — and would not be fine for
 * anything security-critical.
 */
export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * A short salted hash of the address, or null when no salt is configured.
 *
 * The salt is what stops the hash being reversible: the space of IPv4 addresses
 * is small enough to enumerate, so an unsalted hash is barely different from
 * storing the address. No salt configured means store nothing at all.
 */
export function hashIp(ip) {
  if (!config.ipHashSalt) return null;
  return createHash('sha256')
    .update(`${config.ipHashSalt}:${ip}`)
    .digest('hex')
    .slice(0, 16);
}

/** User agent, straight from the header and cut to a sane length. */
export function userAgent(req) {
  const value = req.headers['user-agent'];
  return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 240) : null;
}
