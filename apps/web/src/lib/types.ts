export type DocumentResponse = {
  id: string;
  repo: string;
  file_path: string;
  source_commit: string;
  markdown: string;
};

export type MarginAnchor = {
  start_line: number;
  end_line: number;
  quote: string;
  prefix: string;
  suffix: string;
  heading_path: string[];
  content_hash: string;
};

export type MarginComment = {
  id: string;
  author: string;
  body: string;
  resolved: boolean;
  anchor: MarginAnchor;
  created_at: string;
};

export type MarginSuggestion = {
  id: string;
  author: string;
  original: string;
  replacement: string;
  applied: boolean;
  resolved: boolean;
  anchor: MarginAnchor;
  created_at: string;
};

export type Review = {
  id: string;
  repo: string;
  file_path: string;
  source_commit: string;
  reviewer: string;
  comments: MarginComment[];
  suggestions: MarginSuggestion[];
  created_at: string;
};
