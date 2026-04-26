import type { DocumentResponse, PublishResponse, RepoSummary, Review } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:4317';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  repos: () => request<RepoSummary[]>('/api/repos'),
  document: (id: string) => request<DocumentResponse>(`/api/documents/${id}`),
  createReview: (payload: {
    repo: string;
    file_path: string;
    source_commit: string;
    reviewer: string;
  }) =>
    request<Review>('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  addComment: (reviewId: string, payload: { author: string; body: string; quote: string }) =>
    request<Review>(`/api/reviews/${reviewId}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  addSuggestion: (
    reviewId: string,
    payload: { author: string; original: string; replacement: string }
  ) =>
    request<Review>(`/api/reviews/${reviewId}/suggestions`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateSuggestionStatus: (
    reviewId: string,
    suggestionId: string,
    payload: { applied?: boolean; resolved?: boolean }
  ) =>
    request<Review>(`/api/reviews/${reviewId}/suggestions/${suggestionId}/status`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  approve: (reviewId: string, status: string) =>
    request<Review>(`/api/reviews/${reviewId}/approval`, {
      method: 'POST',
      body: JSON.stringify({ status })
    }),
  publish: (reviewId: string) =>
    request<PublishResponse>(`/api/reviews/${reviewId}/publish`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  eventsUrl: (reviewId: string) => `${API_BASE}/api/reviews/${reviewId}/events`
};
