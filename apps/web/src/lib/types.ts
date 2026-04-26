export type RepoSummary = {
  id: string;
  name: string;
  provider: string;
  default_branch: string;
};

export type DocumentResponse = {
  id: string;
  repo: string;
  file_path: string;
  source_commit: string;
  markdown: string;
};

export type ApiAnchor = {
  start_line: number;
  end_line: number;
  quote: string;
  prefix: string;
  suffix: string;
  heading_path: string[];
  content_hash: string;
};

export type ApiComment = {
  id: string;
  author: string;
  body: string;
  resolved: boolean;
  anchor: ApiAnchor;
  created_at: string;
};

export type ApiSuggestion = {
  id: string;
  author: string;
  original: string;
  replacement: string;
  applied: boolean;
  resolved: boolean;
  anchor: ApiAnchor;
  created_at: string;
};

export type Review = {
  id: string;
  repo: string;
  file_path: string;
  source_commit: string;
  reviewer: string;
  approval: string | null;
  comments: ApiComment[];
  suggestions: ApiSuggestion[];
  created_at: string;
};

export type PublishResponse = {
  job: {
    id: string;
    review_id: string;
    status: string;
    pr_url: string | null;
    created_at: string;
  };
  branch_name: string;
  markdown_patch_preview: string;
  sidecar_path: string;
  sidecar_yaml: string;
};
