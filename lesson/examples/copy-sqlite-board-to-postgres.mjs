import knex from 'knex';

const { SQLITE_PATH, TARGET_DATABASE_URL } = process.env;
if (!SQLITE_PATH || !TARGET_DATABASE_URL) throw new Error('Set SQLITE_PATH and TARGET_DATABASE_URL');
const source = knex({
  client: 'better-sqlite3', connection: { filename: SQLITE_PATH, readonly: true, fileMustExist: true },
  useNullAsDefault: true, pool: { min: 1, max: 1 },
});
const target = knex({ client: 'pg', connection: TARGET_DATABASE_URL });
const tables = ['users', 'posts', 'comments', 'oauthAccounts', 'payments', 'aiQuestions', 'aiDailyUsage'];
const serialTables = new Set(['users', 'posts', 'comments', 'aiQuestions']);

try {
  const counts = await target.transaction(async (trx) => {
    await trx.raw('lock table users, posts, comments, sessions, "oauthAccounts", payments, "aiQuestions", "aiDailyUsage" in exclusive mode');
    const result = {};
    for (const table of tables) {
      const [{ count }] = await trx(table).count('* as count');
      if (Number(count)) throw new Error('Target table is not empty: ' + table);
      let offset = 0;
      const key = serialTables.has(table) || ['payments'].includes(table) ? ['id'] :
        (table === 'oauthAccounts' ? ['subject'] : ['userId', 'day']);
      while (true) {
        const rows = await source(table).select('*').orderBy(key).limit(100).offset(offset);
        if (!rows.length) break;
        await trx(table).insert(rows);
        offset += rows.length;
      }
      if (serialTables.has(table)) {
        await trx.raw("select setval(pg_get_serial_sequence(?, 'id'), coalesce(max(id), 1), count(*) > 0) from ??",
          [trx.ref(table).toQuery(), table]);
      }
      result[table] = offset;
    }
    return result;
  });
  console.log(counts);
} finally {
  await Promise.all([source.destroy(), target.destroy()]);
}
