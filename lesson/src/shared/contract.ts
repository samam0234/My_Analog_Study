export interface Author {
  id: number;
  nickname: string;
}

export interface User extends Author {
  email: string;
}

export interface PostSummary {
  id: number;
  title: string;
  author: Author;
  commentCount: number;
  createdAt: string;
}

export interface Post extends PostSummary {
  body: string;
  tags: string[];
  updatedAt: string;
}

export interface Comment {
  id: number;
  body: string;
  author: Author;
  createdAt: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  q?: string;
}

export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
  requestId: string;
}
