import type { Knex } from 'knex';
import type { Comment, PageMeta, Post, PostSummary } from '../../shared/contract';
import { insertId } from './db';
import { fail, missing } from './http';
import type { ListQuery, PostInput, PostPatch } from './schemas';

const timestamp = () => new Date().toISOString();

interface PostRow extends Omit<Post, 'author' | 'tags'> {
  authorId: number;
  nickname: string;
  tags: string;
}

function summaries(db: Knex) {
  return db('posts as p').join('users as u', 'u.id', 'p.authorId')
    .select('p.*', 'u.nickname')
    .select(db('comments as c').count('*').whereRaw('?? = ??', ['c.postId', 'p.id']).as('commentCount'));
}

function summary(row: PostRow): PostSummary {
  return {
    id: row.id, title: row.title, author: { id: row.authorId, nickname: row.nickname },
    commentCount: Number(row.commentCount), createdAt: row.createdAt,
  };
}

export async function listPosts(db: Knex, query: ListQuery): Promise<{ data: PostSummary[]; meta: PageMeta }> {
  const { q, page, limit, sort } = query;
  const list = summaries(db);
  const count = db('posts as p').count({ total: '*' });
  if (q) {
    const pattern = '%' + q.toLowerCase().replace(/[!%_]/g, '!$&') + '%';
    for (const builder of [list, count]) {
      builder.whereRaw("LOWER(??) LIKE ? ESCAPE '!' OR LOWER(??) LIKE ? ESCAPE '!'", ['p.title', pattern, 'p.body', pattern]);
    }
  }
  if (sort === '-commentCount') list.orderBy('commentCount', 'desc');
  list.orderBy('p.createdAt', sort === 'createdAt' ? 'asc' : 'desc')
    .orderBy('p.id', sort === 'createdAt' ? 'asc' : 'desc');
  const [rows, [record]] = await Promise.all([list.limit(limit).offset((page - 1) * limit), count]);
  const total = Number(record.total);
  return { data: rows.map(summary), meta: { page, limit, total, totalPages: Math.ceil(total / limit), q } };
}

export async function getPost(db: Knex, id: number): Promise<Post> {
  const row: PostRow | undefined = await summaries(db).where('p.id', id).first();
  if (!row) return missing();
  return { ...summary(row), body: row.body, tags: JSON.parse(row.tags), updatedAt: row.updatedAt };
}

export async function addPost(db: Knex, authorId: number, input: PostInput): Promise<Post> {
  const now = timestamp();
  const id = await insertId(db, 'posts', { ...input, tags: JSON.stringify(input.tags), authorId, createdAt: now, updatedAt: now });
  return getPost(db, id);
}

async function ensureOwner(db: Knex, table: 'posts' | 'comments', id: number, userId: number) {
  const item = await db(table).where({ id }).first('authorId');
  if (!item) return missing();
  if (item.authorId !== userId) fail(403, 'FORBIDDEN', '작성자만 변경할 수 있습니다.');
}

export async function editPost(db: Knex, id: number, userId: number, patch: PostPatch) {
  return db.transaction(async (trx) => {
    await ensureOwner(trx, 'posts', id, userId);
    const { tags, ...fields } = patch;
    const changed = await trx('posts').where({ id, authorId: userId })
      .update({ ...fields, ...(tags ? { tags: JSON.stringify(tags) } : {}), updatedAt: timestamp() });
    if (!changed) return missing();
    return getPost(trx, id);
  });
}

export async function removeItem(db: Knex, table: 'posts' | 'comments', id: number, userId: number) {
  await ensureOwner(db, table, id, userId);
  if (!(await db(table).where({ id, authorId: userId }).delete())) missing();
}

interface CommentRow {
  id: number;
  body: string;
  authorId: number;
  nickname: string;
  createdAt: string;
}

function commentDto(row: CommentRow): Comment {
  return { id: row.id, body: row.body, author: { id: row.authorId, nickname: row.nickname }, createdAt: row.createdAt };
}

export async function listComments(db: Knex, postId: number, query: ListQuery) {
  await getPost(db, postId);
  const { page, limit } = query;
  const [rows, [record]] = await Promise.all([
    db('comments as c').join('users as u', 'u.id', 'c.authorId').where('c.postId', postId)
      .select('c.*', 'u.nickname').orderBy('c.id').limit(limit).offset((page - 1) * limit),
    db('comments').where({ postId }).count({ total: '*' }),
  ]);
  const total = Number(record.total);
  return { data: rows.map(commentDto), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function addComment(db: Knex, postId: number, authorId: number, body: string): Promise<Comment> {
  return db.transaction(async (trx) => {
    await getPost(trx, postId);
    const createdAt = timestamp();
    const id = await insertId(trx, 'comments', { postId, authorId, body, createdAt });
    const { nickname } = await trx('users').where({ id: authorId }).first('nickname');
    return commentDto({ id, body, authorId, nickname, createdAt });
  });
}
