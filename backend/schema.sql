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

-- Individual submitted responses. Each row now carries both the student's own
-- position and their pre-reveal prediction of where the class overall will
-- land. Existing deployments are migrated automatically by server.js, while
-- this ALTER also makes the standalone schema script safe to re-run.
CREATE TABLE IF NOT EXISTS responses (
  id SERIAL PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id),
  respondent_token TEXT NOT NULL,
  value INTEGER NOT NULL,
  predicted_value INTEGER,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE responses
  ADD COLUMN IF NOT EXISTS predicted_value INTEGER;

CREATE INDEX IF NOT EXISTS idx_responses_activity ON responses(activity_id);
CREATE INDEX IF NOT EXISTS idx_responses_token ON responses(activity_id, respondent_token);

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
