import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../src/server/lib/auth';
import { databaseConfig } from '../src/server/lib/config';
import { insertId, migrate } from '../src/server/lib/db';
import { selectExcerpts } from '../src/server/lib/documents';
import { cachedList, invalidateList } from '../src/server/lib/notifications';
import { addComment, addPost, editPost, listPosts, removeItem } from '../src/server/lib/posts';
import { listSchema, patchSchema, postSchema } from '../src/server/lib/schemas';

describe('Analog board domain', () => {
  let db: Knex;
  let author: number;

  beforeEach(async () => {
    db = knex(databaseConfig({ SQLITE_PATH: ':memory:' }));
    await migrate(db);
    author = await insertId(db, 'users', { email: 'author@example.com', nickname: '작성자' });
  });

  afterEach(async () => {
    vi.useRealTimers();
    invalidateList();
    await db.destroy();
  });

  it('enforces fields and preserves omitted PATCH tags', async () => {
    expect(() => postSchema.parse({ title: ' ', body: 'ok' })).toThrow();
    const row = await addPost(db, author, { title: 'Analog with 100%', body: 'body', tags: ['study'] });
    const updated = await editPost(db, row.id, author, patchSchema.parse({ title: 'Analog with 50%' }));
    expect(updated).toMatchObject({ tags: ['study'], title: 'Analog with 50%' });
    expect((await listPosts(db, listSchema.parse({ q: '%', limit: '99' }))).meta).toMatchObject({ total: 1, limit: 50 });
    expect((await listPosts(db, listSchema.parse({ q: '_' }))).meta.total).toBe(0);
  });

  it('counts comments, checks ownership, and cascades deletion', async () => {
    const post = await addPost(db, author, { title: '제목', body: '본문', tags: [] });
    await addComment(db, post.id, author, '댓글');
    expect((await listPosts(db, listSchema.parse({ sort: '-commentCount' }))).data[0].commentCount).toBe(1);
    await expect(removeItem(db, 'posts', post.id, author + 1)).rejects.toMatchObject({ status: 403 });
    await removeItem(db, 'posts', post.id, author);
    expect(await db('comments').count('* as total').first()).toEqual({ total: 0 });
  });

  it('salts identical passwords and finds only relevant excerpts', async () => {
    const hash = await hashPassword('a test password');
    expect(hash).not.toBe(await hashPassword('a test password'));
    expect(await verifyPassword('a test password', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(selectExcerpts('Analog 서버를 학습합니다.', 'Analog 서버?')).toHaveLength(1);
    expect(selectExcerpts('Analog 서버를 학습합니다.', '배송')).toEqual([]);
  });

  it('uses a fake repository to test cache expiry and invalidation', async () => {
    vi.useFakeTimers();
    const result = { data: [], meta: { page: 1, limit: 10, totalPages: 0, total: 0 } };
    const fetchPosts = vi.fn(async () => result);
    await cachedList('page1', fetchPosts);
    await cachedList('page1', fetchPosts);
    expect(fetchPosts).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5001);
    await cachedList('page1', fetchPosts);
    invalidateList();
    await cachedList('page1', fetchPosts);
    expect(fetchPosts).toHaveBeenCalledTimes(3);
  });
});
