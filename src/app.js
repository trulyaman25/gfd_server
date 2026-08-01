/* ============================================================================
 *  The Express app, with no listening and no database connection of its own, so
 *  it can be imported and exercised directly.
 * ========================================================================== */

import express from 'express';
import { config } from './config.js';
import { isReady, describeTarget } from './db.js';
import { cors } from './middleware/cors.js';
import { attemptsRouter } from './routes/attempts.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  /* Trust the proxy's x-forwarded-* headers when deployed behind one, so req.ip
   * and req.protocol reflect the original request. */
  app.set('trust proxy', true);

  app.use(cors);
  app.use(express.json({ limit: config.maxBodyBytes }));

  /* Liveness, and the one place the connection target is exposed — with the
   * credentials stripped out by describeTarget. */
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      db: isReady() ? 'connected' : 'disconnected',
      target: describeTarget(),
      readEnabled: Boolean(config.adminToken),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.use('/api', attemptsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  /* Last resort. A stack trace in a response tells an attacker about the
   * internals and tells everyone else nothing useful, so it stays in the log. */
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    /* express.json answers this way on malformed JSON and on a body over the
     * limit; both are the caller's problem, not a server fault. */
    const status = error.status && error.status < 500 ? error.status : 500;

    if (status >= 500) {
      console.error(`  Unhandled error on ${req.method} ${req.path}: ${error.message}`);
    }

    return res.status(status).json({ error: status >= 500 ? 'server error' : 'bad request' });
  });

  return app;
}
