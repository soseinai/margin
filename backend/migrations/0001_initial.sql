CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY,
  repo text NOT NULL,
  file_path text NOT NULL,
  source_commit text NOT NULL,
  reviewer text NOT NULL,
  approval text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_comments (
  id uuid PRIMARY KEY,
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  author text NOT NULL,
  body text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  anchor jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_suggestions (
  id uuid PRIMARY KEY,
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  author text NOT NULL,
  original text NOT NULL,
  replacement text NOT NULL,
  applied boolean NOT NULL DEFAULT true,
  anchor jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS publish_jobs (
  id uuid PRIMARY KEY,
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  status text NOT NULL,
  pr_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
