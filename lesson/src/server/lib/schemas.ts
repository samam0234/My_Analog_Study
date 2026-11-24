import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('이메일 형식을 확인하세요.').max(254);
const password = z.string().min(10, '비밀번호는 10자 이상이어야 합니다.').max(128);
export const signupSchema = z.object({ email, password, nickname: z.string().trim().min(1).max(40) });
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
const postFields = {
  title: z.string().trim().min(1, '제목을 입력하세요.').max(200),
  body: z.string().trim().min(1, '본문을 입력하세요.').max(10_000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
};
export const postSchema = z.object(postFields).strict();
export const patchSchema = z.object({ ...postFields, tags: postFields.tags.removeDefault() })
  .partial().strict().refine((value) => Object.keys(value).length > 0, '수정할 필드를 보내세요.');
export const commentSchema = z.object({ body: z.string().trim().min(1).max(1000) });
const positive = z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger);
export const listSchema = z.object({
  page: positive.optional().transform((value) => value ?? 1),
  limit: positive.optional().transform((value) => Math.min(value ?? 10, 50)),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['createdAt', '-createdAt', '-commentCount']).default('-createdAt'),
}).refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit), '페이지 범위를 줄이세요.');
export type ListQuery = z.output<typeof listSchema>;
export type PostInput = z.output<typeof postSchema>;
export type PostPatch = z.output<typeof patchSchema>;
