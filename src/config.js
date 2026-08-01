/* ============================================================================
 *  Environment, read once and validated up front.
 *
 *  Anything missing or obviously still a placeholder stops the process here with
 *  a message that says what to do about it. Failing at boot with a clear reason
 *  beats failing on the first request with a DNS error.
 * ========================================================================== */

import 'dotenv/config';

/** Placeholder fragments from .env.example. If any survive, .env was not filled in. */
const PLACEHOLDERS = ['USERNAME:PASSWORD', 'CLUSTER.mongodb.net', '<db_password>', '<password>'];

function fail(message) {
  console.error(`\n  Cannot start: ${message}\n`);
  process.exit(1);
}

function str(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function int(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

/* ------------------------------------------------------------------- mongo ---*/
const uri = str('MONGODB_URI');

if (!uri) {
  fail('MONGODB_URI is not set. Copy .env.example to .env and paste your MongoDB URI in.');
}

if (PLACEHOLDERS.some((token) => uri.includes(token))) {
  fail(
    'MONGODB_URI is still the dummy value from .env.example.\n' +
      '  Open .env and replace it with your own connection string\n' +
      '  (Atlas: Database > Connect > Drivers), password included.'
  );
}

if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
  fail('MONGODB_URI does not look like a MongoDB connection string.');
}

/* --------------------------------------------------------------------- app ---*/
const allowedOrigins = str('ALLOWED_ORIGINS')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const adminToken = str('ADMIN_TOKEN');

/* A token short enough to brute force is worse than none, because it reads as
 * protection. Refuse rather than pretend. */
if (adminToken && adminToken.length < 16) {
  fail('ADMIN_TOKEN is too short. Use at least 16 characters, or leave it empty.');
}

export const config = {
  env: str('NODE_ENV', 'development'),

  mongoUri: uri,
  mongoDb: str('MONGODB_DB', 'girlfriends_day'),

  port: int('PORT', 4500),
  host: (() => {
    const host = str('HOST', '0.0.0.0');
    if (str('NODE_ENV', 'development') === 'production' && ['127.0.0.1', 'localhost', '::1'].includes(host)) {
      return '0.0.0.0';
    }
    return host;
  })(),

  adminToken: adminToken || null,
  allowedOrigins,
  ipHashSalt: str('IP_HASH_SALT') || null,
  attemptTtlDays: Math.max(0, int('ATTEMPT_TTL_DAYS', 0)),

  /* Request limits. Small on purpose: the payload is one quiz attempt. */
  maxBodyBytes: '16kb',
  rateLimit: {
    windowMs: 60_000,
    maxPerWindow: 20,
  },
};

/** Warnings worth seeing at boot, but not worth refusing to start over. */
export function configWarnings() {
  const warnings = [];

  if (!config.adminToken) {
    warnings.push(
      'ADMIN_TOKEN is empty, so GET /api/quiz-attempts is disabled. Attempts will still be saved.'
    );
  }

  if (config.allowedOrigins.length === 0) {
    warnings.push(
      'ALLOWED_ORIGINS is empty and the server allows every browser origin. Set it only if you want to re-enable origin restrictions later.'
    );
  }

  if (config.host === '0.0.0.0' && !config.adminToken) {
    warnings.push('Listening on all interfaces with no ADMIN_TOKEN set.');
  }

  return warnings;
}
