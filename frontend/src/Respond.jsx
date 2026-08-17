import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";

const API = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const TOKEN_TTL_MS = 10 * 60 * 1000;

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function currentActivityId() {
  const parts = (window.location.hash || "").split("/").filter(Boolean);
  return parts[parts.length - 1] || "unknown-activity";
}

function getToken() {
  const activityId = currentActivityId();
  const storageKey = `gedl:${activityId}:participant`;
  const now = Date.now();
  let stored = null;

  try {
    stored = JSON.parse(localStorage.getItem(storageKey));
  } catch {
    stored = null;
  }

  if (
    stored?.token &&
    Number.isFinite(stored.lastSeen) &&
    now - stored.lastSeen < TOKEN_TTL_MS
  ) {
    localStorage.setItem(storageKey, JSON.stringify({ token: stored.token, lastSeen: now }));
    return stored.token;
  }

  const token = generateId();
  localStorage.setItem(storageKey, JSON.stringify({ token, lastSeen: now }));
  localStorage.removeItem("likert-token");
  localStorage.removeItem(`likert-value-${activityId}`);
  localStorage.removeItem(`likert-response-${activityId}`);
  return token;
}

export default function Respond() {
  const { id } = useParams();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [aggregate, setAggregate] = useState(null);
  const [token] = useState(getToken);

  useEffect(() => {
    fetch(`${API}/api/config/likert/${id}`)
      .then((r) => {
        if (!r.ok) {
          throw new Error(
            r.status === 404
              ? "This poll does not exist. Check the link you were given."
              : "This poll is not currently active."
          );
        }
        return r.json();
      })
      .then(setConfig)
      .catch((e) => setError(e.message));

    try {
      const stored = JSON.parse(localStorage.getItem(`likert-response-${id}`));
      if (Number.isInteger(stored?.value) && Number.isInteger(stored?.prediction)) {
        setSelected(stored.value);
        setPrediction(stored.prediction);
        setSubmitted(true);
      } else {
        const legacyValue = Number(localStorage.getItem(`likert-value-${id}`));
        if (Number.isInteger(legacyValue) && legacyValue > 0) setSelected(legacyValue);
      }
    } catch {
      // Ignore malformed local state.
    }
  }, [id]);

  const fetchAggregate = useCallback(() => {
    fetch(`${API}/api/aggregate/likert/${id}`)
      .then((r) => r.json())
      .then(setAggregate)
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!submitted) return;
    fetchAggregate();
    const interval = setInterval(fetchAggregate, 3000);
    return () => clearInterval(interval);
  }, [submitted, fetchAggregate]);

  const submit = async () => {
    if (selected === null || prediction === null) return;
    const res = await fetch(`${API}/api/response/likert/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: selected, prediction, token }),
    });
    if (res.ok) {
      const data = await res.json();
      const committedPrediction = data.prediction ?? prediction;
      setPrediction(committedPrediction);
      localStorage.setItem(
        `likert-response-${id}`,
        JSON.stringify({ value: selected, prediction: committedPrediction })
      );
      localStorage.setItem(`likert-value-${id}`, String(selected));
      setSubmitted(true);
      setEditing(false);
      fetchAggregate();
    }
  };

  if (error) {
    return <div className="wrap"><p className="error">{error}</p></div>;
  }

  if (!config) {
    return <div className="wrap"><p className="muted">Loading…</p></div>;
  }

  const points = Array.from({ length: config.scale_points }, (_, i) => i + 1);
  const locked = submitted && !editing;
  const predictionLockedByReveal = Boolean(aggregate?.revealed);

  return (
    <div className="wrap respond-wrap">
      <div className="activity-kicker">B1141 · Week {config.week}</div>
      <h1>{config.statement}</h1>

      <ScaleQuestion
        number="1"
        label="What do you think?"
        value={selected}
        setValue={setSelected}
        points={points}
        anchors={config.anchors}
        disabled={locked}
      />

      <ScaleQuestion
        number="2"
        label={config.prediction_prompt}
        hint="Use the same scale to predict the class's overall position."
        value={prediction}
        setValue={setPrediction}
        points={points}
        anchors={config.anchors}
        disabled={locked || predictionLockedByReveal}
        prediction
      />

      {locked ? (
        <>
          <div className="confirmation">
            <div className="commit-summary">
              <div><span>Your view</span><strong>{selected}</strong></div>
              <div><span>Your class prediction</span><strong>{prediction}</strong></div>
            </div>

            {aggregate?.revealed ? (
              <AggregateView aggregate={aggregate} prediction={prediction} />
            ) : (
              <div className="anticipation-hold">
                <strong>Locked in.</strong>
                <span>Now see whether the class lands where you expected.</span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="change-mind"
            onClick={() => setEditing(true)}
          >
            {aggregate?.revealed ? "Change your own view?" : "Change your answers?"}
          </button>
        </>
      ) : (
        <>
          {submitted && aggregate?.revealed && (
            <p className="prediction-lock-note">
              Your class prediction is now locked because the class result has been revealed.
            </p>
          )}
          <button
            className="submit"
            disabled={selected === null || prediction === null}
            onClick={submit}
          >
            {submitted ? "Update my view" : "Lock in both answers"}
          </button>
        </>
      )}
    </div>
  );
}

function ScaleQuestion({ number, label, hint, value, setValue, points, anchors, disabled, prediction = false }) {
  return (
    <section className={`question-block${prediction ? " prediction-block" : ""}`}>
      <div className="question-heading">
        <span className="question-number">{number}</span>
        <div>
          <h2>{label}</h2>
          {hint && <p>{hint}</p>}
        </div>
      </div>
      <div className="scale compact-scale">
        <div className="anchors-top">
          <span>{anchors.low}</span>
          <span>{anchors.high}</span>
        </div>
        <div className="points">
          {points.map((p) => (
            <button
              key={p}
              type="button"
              className={`point${value === p ? " selected" : ""}`}
              onClick={() => !disabled && setValue(p)}
              disabled={disabled}
              aria-pressed={value === p}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function AggregateView({ aggregate, prediction }) {
  const actualMean = aggregate.mean;
  const distance = actualMean == null ? null : Math.abs(prediction - actualMean);

  return (
    <div className="aggregate reveal-panel">
      <div className="reveal-heading">
        <div>
          <span className="eyebrow">The reveal</span>
          <h2>How did the room actually land?</h2>
        </div>
        <span className="response-chip">{aggregate.total} responses</span>
      </div>

      <div className="personal-comparison">
        <div><span>You predicted</span><strong>{prediction}</strong></div>
        <div><span>Class average</span><strong>{actualMean == null ? "—" : Number(actualMean).toFixed(1)}</strong></div>
        <div><span>Prediction gap</span><strong>{distance == null ? "—" : `${distance.toFixed(1)} pts`}</strong></div>
      </div>

      <Distribution title="What the class thought" counts={aggregate.counts} />
      <Distribution title="What the class expected the class to think" counts={aggregate.prediction_counts || []} secondary />
    </div>
  );
}

function Distribution({ title, counts, secondary = false }) {
  const max = Math.max(1, ...(counts || [1]));
  return (
    <div className={`distribution${secondary ? " secondary" : ""}`}>
      <h3>{title}</h3>
      <div className="bars">
        {counts.map((c, i) => (
          <div className="bar-row" key={i}>
            <span className="bar-label">{i + 1}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(c / max) * 100}%` }} />
            </div>
            <span className="bar-count">{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
