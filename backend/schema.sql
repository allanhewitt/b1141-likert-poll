-- Run once against the b1141_likert_poll database (see README for the
-- docker exec / psql steps). Safe to re-run: uses IF NOT EXISTS and
-- ON CONFLICT DO NOTHING throughout.

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  week INTEGER NOT NULL,
  activity TEXT NOT NULL,
  sequence INTEGER,
  statement TEXT NOT NULL,
  scale_points INTEGER NOT NULL,
  anchor_low TEXT NOT NULL,
  anchor_high TEXT NOT NULL,
  reveal_mode TEXT NOT NULL DEFAULT 'threshold',
  reveal_threshold REAL,
  cohort_size INTEGER,
  active BOOLEAN NOT NULL DEFAULT true
);

-- Individual submitted responses. Only written when PERSIST_RESPONSES=true
-- on the backend. Never touched by the "clear session" control — that
-- only resets the in-memory live view used during a lecture. Deliberately
-- minimal columns: no identifier that could link a response to a student.
CREATE TABLE IF NOT EXISTS responses (
  id SERIAL PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id),
  value INTEGER NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_responses_activity ON responses(activity_id);

-- Week One seed
INSERT INTO activities (
  id, module, week, activity, sequence,
  statement, scale_points, anchor_low, anchor_high,
  reveal_mode, reveal_threshold, cohort_size, active
) VALUES (
  'b1141-w1-if-sport-disappeared', 'B1141', 1, 'if-sport-disappeared', 1,
  'Sport exists more for individuals than for society.', 5,
  'Strongly disagree', 'Strongly agree',
  'threshold', 0.8, 45, true
) ON CONFLICT (id) DO NOTHING;
