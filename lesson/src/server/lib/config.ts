import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Knex } from 'knex';

export function databaseConfig(env = process.env): Knex.Config {
  const client = env['DB_CLIENT'] || 'better-sqlite3';
  if (client === 'better-sqlite3') {
    const filename = env['SQLITE_PATH'] || './data/board.sqlite';
    if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
    return {
      client,
      connection: { filename },
      useNullAsDefault: true,
      pool: {
        min: 1,
        max: 1,
        afterCreate(connection: { pragma: (sql: string) => void }, done: (error: Error | null, connection?: unknown) => void) {
          connection.pragma('foreign_keys = ON');
          connection.pragma('busy_timeout = 5000');
          done(null, connection);
        },
      },
    };
  }
  if (!['pg', 'mysql2'].includes(client) || !env['DATABASE_URL']) {
    throw new Error('Set DB_CLIENT and DATABASE_URL together');
  }
  return { client, connection: env['DATABASE_URL'], pool: { min: 0, max: 5 } };
}

export function appOrigin(): string {
  const configured = process.env['APP_ORIGIN'];
  if (!configured && process.env['NODE_ENV'] === 'production') {
    throw new Error('APP_ORIGIN is required in production');
  }
  return new URL(configured || 'http://localhost:5173').origin;
}

export function sessionSecret(): Uint8Array {
  const secret = process.env['APP_SECRET'];
  if (!secret || secret.length < 32) throw new Error('APP_SECRET must contain at least 32 characters');
  return new TextEncoder().encode(secret);
}
