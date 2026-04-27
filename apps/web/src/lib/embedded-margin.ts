import type { MarginComment, MarginSuggestion } from './types';

export type MarginCommentBlock = {
  schema: 'margin.markdown-comments';
  version: 1;
  review_id: string;
  reviewer: string;
  comments: MarginComment[];
  suggestions: MarginSuggestion[];
  updated_at: string;
};

export type SplitMarginMarkdown = {
  markdown: string;
  comments: MarginCommentBlock | null;
};

const blockPattern = /(?:\r?\n){0,2}<!--[^\S\r\n]*margin:comments[^\S\r\n]*\r?\n([\s\S]*?)\r?\n-->\s*$/;

export function splitMarginCommentBlock(markdown: string): SplitMarginMarkdown {
  const match = blockPattern.exec(markdown);
  if (!match) return { markdown, comments: null };

  const body = markdown.slice(0, match.index);

  try {
    return {
      markdown: body,
      comments: normalizeMarginCommentBlock(JSON.parse(match[1]))
    };
  } catch {
    return { markdown: body, comments: null };
  }
}

export function appendMarginCommentBlock(markdown: string, comments: MarginCommentBlock | null) {
  const body = splitMarginCommentBlock(markdown).markdown;
  if (!comments || !hasMarginComments(comments)) return body;

  return `${body.replace(/\n*$/, '')}\n\n<!-- margin:comments\n${JSON.stringify(comments, null, 2)}\n-->\n`;
}

function hasMarginComments(comments: MarginCommentBlock) {
  return comments.comments.length > 0 || comments.suggestions.length > 0;
}

function normalizeMarginCommentBlock(value: unknown): MarginCommentBlock | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<MarginCommentBlock>;
  const comments = Array.isArray(candidate.comments) ? candidate.comments.filter(isMarginComment) : [];
  const suggestions = Array.isArray(candidate.suggestions) ? candidate.suggestions.filter(isMarginSuggestion) : [];

  return {
    schema: 'margin.markdown-comments',
    version: 1,
    review_id: stringOr(candidate.review_id, `local-review:${Date.now()}`),
    reviewer: stringOr(candidate.reviewer, 'Local reviewer'),
    comments,
    suggestions,
    updated_at: stringOr(candidate.updated_at, new Date().toISOString())
  };
}

function isMarginComment(value: unknown): value is MarginComment {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as MarginComment;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.author === 'string' &&
    typeof candidate.body === 'string' &&
    typeof candidate.resolved === 'boolean' &&
    isMarginAnchor(candidate.anchor) &&
    typeof candidate.created_at === 'string'
  );
}

function isMarginSuggestion(value: unknown): value is MarginSuggestion {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as MarginSuggestion;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.author === 'string' &&
    typeof candidate.original === 'string' &&
    typeof candidate.replacement === 'string' &&
    typeof candidate.applied === 'boolean' &&
    typeof candidate.resolved === 'boolean' &&
    isMarginAnchor(candidate.anchor) &&
    typeof candidate.created_at === 'string'
  );
}

function isMarginAnchor(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.start_line === 'number' &&
    typeof candidate.end_line === 'number' &&
    typeof candidate.quote === 'string' &&
    typeof candidate.prefix === 'string' &&
    typeof candidate.suffix === 'string' &&
    Array.isArray(candidate.heading_path) &&
    candidate.heading_path.every((item) => typeof item === 'string') &&
    typeof candidate.content_hash === 'string'
  );
}

function stringOr(value: unknown, fallback: string) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
