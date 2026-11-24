import knex, { type Knex } from 'knex';
import { databaseConfig } from './config';

const timestamp = (table: Knex.CreateTableBuilder, name: string) => table.string(name, 24).notNullable();
const userRef = (table: Knex.CreateTableBuilder, name: string) =>
  table.integer(name).unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');

export const migrations: Record<string, Knex.Migration> = {
  '001_board': {
    async up(db) {
      await db.schema.createTable('users', (table) => {
        table.increments('id');
        table.string('email', 254).notNullable().unique();
        table.string('nickname', 40).notNullable();
        table.string('passwordHash', 200).nullable();
      });
      await db.schema.createTable('sessions', (table) => {
        table.string('id', 64).primary();
        userRef(table, 'userId');
        timestamp(table, 'expiresAt');
        table.index('expiresAt');
      });
      await db.schema.createTable('posts', (table) => {
        table.increments('id');
        table.string('title', 200).notNullable();
        table.text('body').notNullable();
        table.text('tags').notNullable();
        userRef(table, 'authorId');
        timestamp(table, 'createdAt');
        timestamp(table, 'updatedAt');
        table.index(['createdAt', 'id']);
      });
      await db.schema.createTable('comments', (table) => {
        table.increments('id');
        table.integer('postId').unsigned().notNullable().references('id').inTable('posts').onDelete('CASCADE');
        userRef(table, 'authorId');
        table.text('body').notNullable();
        timestamp(table, 'createdAt');
        table.index(['postId', 'id']);
      });
    },
    async down(db) {
      for (const name of ['comments', 'posts', 'sessions', 'users']) await db.schema.dropTable(name);
    },
  },
  '002_extensions': {
    async up(db) {
      await db.schema.createTable('oauthAccounts', (table) => {
        table.string('subject', 255).primary();
        userRef(table, 'userId');
      });
      await db.schema.createTable('payments', (table) => {
        table.string('id', 255).primary();
        userRef(table, 'userId');
        timestamp(table, 'createdAt');
      });
      await db.schema.createTable('aiQuestions', (table) => {
        table.increments('id');
        userRef(table, 'userId');
        table.text('question').notNullable();
        table.text('answer').nullable();
        table.integer('inputTokens').nullable();
        table.integer('outputTokens').nullable();
        timestamp(table, 'createdAt');
        table.index(['userId', 'createdAt']);
      });
      await db.schema.createTable('aiDailyUsage', (table) => {
        userRef(table, 'userId');
        table.string('day', 10).notNullable();
        table.integer('requests').notNullable().defaultTo(0);
        table.primary(['userId', 'day']);
      });
    },
    async down(db) {
      for (const name of ['aiDailyUsage', 'aiQuestions', 'payments', 'oauthAccounts']) await db.schema.dropTable(name);
    },
  },
};

export function migrate(db: Knex) {
  return db.migrate.latest({
    migrationSource: {
      getMigrations: async () => Object.keys(migrations).sort(),
      getMigrationName: (name) => String(name),
      getMigration: async (name) => migrations[String(name)],
    },
  });
}

let connection: Knex | undefined;
let ready: Promise<unknown> | undefined;

export async function database(): Promise<Knex> {
  connection ??= knex(databaseConfig());
  ready ??= migrate(connection).catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  await ready;
  return connection;
}

export async function insertId(db: Knex, table: string, values: object): Promise<number> {
  if (db.client.config.client === 'pg') {
    const [row] = await db(table).insert(values).returning<{ id: number }[]>('id');
    return row.id;
  }
  const [id] = await db(table).insert(values);
  return Number(id);
}
