export type LocalDocument = {
  id: string;
  fileName: string;
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
  author_image_url?: string;
  body: string;
  resolved: boolean;
  anchor: MarginAnchor;
  created_at: string;
};

export type MarginSuggestion = {
  id: string;
  author: string;
  author_image_url?: string;
  original: string;
  replacement: string;
  applied: boolean;
  resolved: boolean;
  anchor: MarginAnchor;
  created_at: string;
};

export type LocalAnnotations = {
  id: string;
  fileName: string;
  author: string;
  comments: MarginComment[];
  suggestions: MarginSuggestion[];
  created_at: string;
};
