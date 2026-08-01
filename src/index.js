/* ============================================================================
 *  Start up: connect first, then listen.
 *
 *  In that order on purpose. Listening first would mean the first request could
 *  arrive before the database was ready and fail for a reason that has nothing to
 *  do with the request.
 * ========================================================================== */

import { config, configWarnings } from './config.js';
import { connect, describeTarget, disconnect } from './db.js';
import { createApp } from './app.js';

async function main() {
  console.log(`\n  Connecting to ${describeTarget()} ...`);

  try {
    await connect();
  } catch (error) {
    /* Almost always one of: wrong password, IP not on the Atlas access list, or
     * no network. The driver's message is unhelpful about which, so spell out
     * where to look. */
    console.error(`\n  Could not reach MongoDB: ${error.message}`);
    console.error('  Worth checking:');
    console.error('    - the password in MONGODB_URI is the database user password, not your Atlas login');
    console.error('    - your current IP is on the Atlas Network Access list');
    console.error('    - the cluster is not paused\n');
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(config.port, config.host, () => {
    const base = `http://${config.host}:${config.port}`;
    console.log(`  Quiz server listening on ${base}`);
    console.log(`  POST ${base}/api/quiz-attempt     record an attempt`);
    console.log(
      `  GET  ${base}/api/quiz-attempts    ${
        config.adminToken ? 'read attempts (needs ADMIN_TOKEN)' : 'disabled, no ADMIN_TOKEN set'
      }`
    );

    for (const warning of configWarnings()) {
      console.warn(`  Note: ${warning}`);
    }
    console.log('');
  });

  /* Close the listener before the connection, so nothing in flight loses its
   * database mid-write. */
  const shutdown = async (signal) => {
    console.log(`\n  ${signal} received, shutting down.`);
    server.close(async () => {
      try {
        await disconnect();
      } catch {
        /* Going down anyway. */
      }
      process.exit(0);
    });

    /* If a connection refuses to drain, do not hang forever. */
    setTimeout(() => process.exit(1), 8000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(`  Fatal: ${error.message}`);
  process.exit(1);
});
