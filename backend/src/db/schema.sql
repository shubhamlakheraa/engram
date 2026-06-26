-- Run this in Supabase SQL editor to set up the schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Integrations (one row per user) ─────────────────────────────────────────

CREATE TABLE user_integrations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  notion_token         TEXT,
  notion_database_id   TEXT,
  google_access_token  TEXT,
  google_refresh_token TEXT,
  calendar_id          TEXT DEFAULT 'primary',
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── Solved problems ──────────────────────────────────────────────────────────

CREATE TABLE problems (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES users(id) ON DELETE CASCADE,
  problem_number     TEXT,
  problem_title      TEXT NOT NULL,
  title_slug         TEXT NOT NULL,
  difficulty         TEXT,
  topics             TEXT[],
  problem_url        TEXT,
  lang               TEXT,
  code               TEXT,
  runtime            TEXT,
  memory             TEXT,
  runtime_percentile FLOAT,
  memory_percentile  FLOAT,
  date_solved        TIMESTAMPTZ DEFAULT NOW(),
  notion_page_id     TEXT,
  -- SM-2 state
  ease_factor        FLOAT DEFAULT 2.5,
  interval_days      INT DEFAULT 1,
  repetitions        INT DEFAULT 0,
  next_review_date   DATE,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── Review sessions ──────────────────────────────────────────────────────────

CREATE TABLE reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id        UUID REFERENCES problems(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  review_number     INT NOT NULL,
  scheduled_date    DATE NOT NULL,
  completed_date    TIMESTAMPTZ,
  recall_quality    INT,         -- 0-5 SM-2 scale
  next_interval_days INT,
  review_token      TEXT UNIQUE, -- engram.app/review/{token}
  calendar_event_id TEXT,        -- Google Calendar event ID for deletion/update
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_token    ON reviews(review_token);
CREATE INDEX idx_reviews_user     ON reviews(user_id);
CREATE INDEX idx_problems_user    ON problems(user_id);
CREATE INDEX idx_problems_slug    ON problems(user_id, title_slug);
