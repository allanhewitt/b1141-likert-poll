import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;

const app = express();
app.use(express.json());

// --- CORS ---
const rawOrigins = (process.env.ALLOWED_ORIGINS || "").trim();
const corsOrigin =
  rawOrigins === "*"
    ? "*"
    : rawOrigins === ""
    ? "*"
    : rawOrigins.split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigin }));

// --- Postgres ---
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Every Likert response now contains two linked judgements:
//   1. the student's own position;
//   2. their prediction of where the class overall will land.
// The startup migration keeps existing deployments compatible without a
// manual database step. Existing historical rows simply have NULL prediction.
async function ensureSchema() {
  await pool.query(
    "ALTER TABLE responses ADD COLUMN IF NOT EXISTS predicted_value INTEGER"
  );
}

// Whether to also write each response to Postgres alongside the in-memory
// live session. The live session remains the source for the classroom display.
const PERSIST_RESPONSES = process.env.PERSIST_RESPONSES === "true";

// --- In-memory live session store ---
// responses is keyed by an anonymous activity-scoped browser token. A revised
// own-view submission replaces that token's live position while retaining the
// originally supplied class prediction unless the student changes it before
// results have been revealed.
const sessionStore = new Map();

function getSession(id) {
  if (!sessionStore.has(id)) {
    sessionStore.set(id, { responses: {}, revealed: false });
  }
  return sessionStore.get(id);
}

async function findActivity(id) {
  const { rows } = await pool.query("SELECT * FROM activities WHERE id = $1", [id]);
  return rows[0] || null;
}

function serializeActivity(row) {
  return {
    id: row.id,
    module: row.module,
    week: row.week,
    activity: row.activity,
    sequence: row.sequence,
    statement: row.statement,
    scale_points: row.scale_points,
    anchors: { low: row.anchor_low, high: row.anchor_high },
    prediction_prompt: "Where do you think the rest of the class will land overall?",
    reveal_mode: row.reveal_mode,
    reveal_threshold: row.reveal_threshold,
    cohort_size: row.cohort_size,
    active: row.active,
  };
}

// ---- Config: list (dashboard) ----
app.get("/api/config/likert", async (req, res) => {
  const { module: mod, week, activity } = req.query;
  const clauses = [];
  const params = [];
  if (mod) {
    params.push(mod);
    clauses.push(`module = $${params.length}`);
  }
  if (week) {
    params.push(week);
    clauses.push(`week = $${params.length}`);
  }
  if (activity) {
    params.push(activity);
    clauses.push(`activity = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM activities ${where} ORDER BY week, sequence`,
    params
  );
  res.json(rows.map(serializeActivity));
});

// ---- Config: single instance ----
app.get("/api/config/likert/:id", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (!row.active) return res.status(410).json({ error: "Inactive" });
  res.json(serializeActivity(row));
});

// ---- Submit a paired response (own view + class prediction) ----
app.post("/api/response/likert/:id", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Unknown activity" });

  const { value, prediction, token } = req.body;
  const validPoint = (v) =>
    Number.isInteger(v) && v >= 1 && v <= row.scale_points;

  if (!validPoint(value)) {
    return res.status(400).json({ error: "Invalid own-view value" });
  }
  if (!validPoint(prediction)) {
    return res.status(400).json({ error: "Invalid class prediction" });
  }
  if (typeof token !== "string" || token.length < 8) {
    return res.status(400).json({ error: "Missing or invalid token" });
  }

  const session = getSession(req.params.id);
  const existing = session.responses[token];

  // Once the class reveal has happened, the prediction is epistemically
  // committed: students may reconsider their own view, but cannot rewrite
  // what they had expected the room to think after seeing the answer.
  const committedPrediction =
    session.revealed && existing ? existing.prediction : prediction;

  session.responses[token] = {
    value,
    prediction: committedPrediction,
  };

  if (PERSIST_RESPONSES) {
    await pool.query(
      "INSERT INTO responses (activity_id, respondent_token, value, predicted_value) VALUES ($1, $2, $3, $4)",
      [req.params.id, token, value, committedPrediction]
    );
  }

  res.json({
    ok: true,
    count: Object.keys(session.responses).length,
    prediction: committedPrediction,
  });
});

// ---- Aggregate: actual class positions + predicted class positions ----
app.get("/api/aggregate/likert/:id", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Unknown activity" });
  const session = getSession(req.params.id);

  const responses = Object.values(session.responses);
  const counts = Array.from({ length: row.scale_points }, () => 0);
  const predictionCounts = Array.from({ length: row.scale_points }, () => 0);

  let valueSum = 0;
  let predictionSum = 0;
  responses.forEach(({ value, prediction }) => {
    counts[value - 1]++;
    predictionCounts[prediction - 1]++;
    valueSum += value;
    predictionSum += prediction;
  });

  const total = responses.length;
  const mean = total ? valueSum / total : null;
  const predictionMean = total ? predictionSum / total : null;

  const thresholdMet =
    !!row.cohort_size &&
    total / row.cohort_size >= (row.reveal_threshold ?? 1);

  let revealed = false;
  if (row.reveal_mode === "immediate") revealed = true;
  else if (row.reveal_mode === "threshold") revealed = thresholdMet || session.revealed;
  else if (row.reveal_mode === "manual") revealed = session.revealed;

  // Keep the session's committed reveal state in sync with automatic modes so
  // predictions also become immutable the moment students can see results.
  if (revealed) session.revealed = true;

  res.json({
    id: req.params.id,
    total,
    counts,
    prediction_counts: predictionCounts,
    mean,
    prediction_mean: predictionMean,
    revealed,
    thresholdMet,
  });
});

// ---- Lecturer controls ----
app.post("/api/session/:id/reveal", (req, res) => {
  getSession(req.params.id).revealed = true;
  res.json({ ok: true });
});

app.post("/api/session/:id/clear", (req, res) => {
  sessionStore.set(req.params.id, { responses: {}, revealed: false });
  res.json({ ok: true });
});

app.get("/api/health", (req, res) =>
  res.json({ ok: true, persisting: PERSIST_RESPONSES })
);

const PORT = process.env.PORT || 4000;
ensureSchema()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`Likert API listening on :${PORT} (persist=${PERSIST_RESPONSES})`)
    );
  })
  .catch((err) => {
    console.error("Failed to initialise Likert schema", err);
    process.exit(1);
  });
