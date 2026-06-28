-- FSRS migration: add memory state columns to problems, fix recall_quality type

ALTER TABLE problems
  ADD COLUMN IF NOT EXISTS stability        float8  NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS memory_difficulty float8  NOT NULL DEFAULT 7.2102,
  ADD COLUMN IF NOT EXISTS last_review_date  date,
  ADD COLUMN IF NOT EXISTS notes             text;

-- recall_quality was stored as int (SM-2 scores 0/2/5); change to text for FSRS labels
ALTER TABLE reviews
  ALTER COLUMN recall_quality TYPE text USING recall_quality::text;

-- Backfill last_review_date for existing problems from date_solved
UPDATE problems SET last_review_date = date_solved::date WHERE last_review_date IS NULL;
