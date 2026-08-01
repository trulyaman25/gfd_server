/* ============================================================================
 *  MongoDB connection.
 *
 *  One connection for the process, opened before the server starts listening, so
 *  a request never arrives before the database is ready.
 *
 *  Nothing in here logs the URI. It contains the password, and connection
 *  strings end up pasted into issues and screenshots more often than anyone
 *  would like.
 * ========================================================================== */

import mongoose from 'mongoose';
import { config } from './config.js';

/** Strips credentials so a connection target can be logged safely. */
export function describeTarget(uri = config.mongoUri) {
  try {
    const { protocol, hostname } = new URL(uri.replace('mongodb+srv://', 'mongodb://'));
    return `${protocol.replace(':', '')}://${hostname}/${config.mongoDb}`;
  } catch {
    return `(unparseable URI)/${config.mongoDb}`;
  }
}

export async function connect() {
  mongoose.set('strictQuery', true);

  /* Buffering hides outages: a write issued while the connection is down would
   * sit in memory and resolve much later, or time out with a misleading error.
   * Off means a write during an outage fails immediately and the route can
   * answer 503 honestly. */
  mongoose.set('bufferCommands', false);

  await mongoose.connect(config.mongoUri, {
    dbName: config.mongoDb,
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 20_000,
    maxPoolSize: 5,
    retryWrites: true,
  });

  /* Reconnects are handled by the driver. These only exist so an outage shows up
   * in the log rather than as unexplained 503s. */
  mongoose.connection.on('disconnected', () => {
    console.warn('  MongoDB disconnected. The driver will keep retrying.');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('  MongoDB reconnected.');
  });

  mongoose.connection.on('error', (error) => {
    console.error(`  MongoDB error: ${error.message}`);
  });

  return mongoose.connection;
}

/** 1 = connected. Used by the health check and by routes before they write. */
export function isReady() {
  return mongoose.connection.readyState === 1;
}

export async function disconnect() {
  await mongoose.connection.close(false);
}
