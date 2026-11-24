import { fail } from './http';

export interface Excerpt { number: number; text: string }

export function selectExcerpts(document: string, question: string): Excerpt[] {
  const terms = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])];
  const chunks = (document.match(/[^]{1,600}/gu) || []).map((text, index) => ({ number: index + 1, text }));
  return chunks.map((excerpt) => ({
    ...excerpt,
    score: terms.filter((term) => excerpt.text.toLowerCase().includes(term)).length,
  })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score)
    .slice(0, 3).map(({ number, text }) => ({ number, text }));
}

export function requireExcerpts(document: string, question: string) {
  if (!document.trim()) return fail(400, 'VALIDATION_ERROR', '문서 내용을 입력하세요.');
  return selectExcerpts(document, question);
}
