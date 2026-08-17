import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";

const API = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const TOKEN_TTL_MS = 10 * 60 * 1000;

// Anonymous browser tokens are scoped to one activity and expire after
// 10 minutes away from that activity. This is enough to survive a refresh
// during a short classroom task without creating a persistent cross-activity
// browser identifier.
//
// crypto.randomUUID() only works in a "secure context" (HTTPS, or
// localhost) — it throws on a plain http:// sslip.io deployment like
// this one, which blanks the whole page. Fall back to a manual random
// ID when it's unavailable, so this works before a real domain/SSL is
// set up too.
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through to the manual generator below
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

  // Remove the former app-wide identifier and any stale cached answer for
  // this activity whenever a fresh anonymous activity session begins.
  localStorage.removeItem("likert-token");
  localStorage.removeItem(`likert-value-${activityId}`);

  return token;
}

export default function Respond() {
  const { id } = useParams();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
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

    const storedValue = localStorage.getItem(`likert-value-${id}`);
    if (storedValue) {
      setSubmitted(true);
      setSelected(Number(storedValue));
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
    if (selected === null) return;
    const res = await fetch(`${API}/api/response/likert/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: selected, token }),
    });
    if (res.ok) {
      localStorage.setItem(`likert-value-${id}`, String(selected));
      setSubmitted(true);
      setEditing(false);
    }
  };

  if (error) {
    return (
      <div className="wrap">
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const points = Array.from({ length: config.scale_points }, (_, i) => i + 1);
  const locked = submitted && !editing;

  return (
    <div className="wrap">
      <h1>{config.statement}</h1>
      <div className="scale">
        <div className="anchors-top">
          <span>{config.anchors.low}</span>
          <span>{config.anchors.high}</span>
        </div>
        <div className="points">
          {points.map((p) => (
            <button
              key={p}
              type="button"
              className={`point${selected === p ? " selected" : ""}`}
              onClick={() => !locked && setSelected(p)}
              disabled={locked}
              aria-pressed={selected === p}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {locked ? (
        <>
          <div className="confirmation">
            <p className="muted">Thanks — your response has been recorded.</p>
            {aggregate?.revealed ? (
              <AggregateView aggregate={aggregate} />
            ) : (
              <p className="muted">
                Results will appear once enough of the class has responded.
              </p>
            )}
          </div>
          <button
            type="button"
            className="change-mind"
            onClick={() => setEditing(true)}
          >
            Change your mind?
          </button>
        </>
      ) : (
        <button className="submit" disabled={selected === null} onClick={submit}>
          {submitted ? "Update response" : "Submit"}
        </button>
      )}
    </div>
  );
}

function AggregateView({ aggregate }) {
  const max = Math.max(1, ...aggregate.counts);
  return (
    <div className="aggregate">
      <p className="muted">
        {aggregate.total} response{aggregate.total === 1 ? "" : "s"}
      </p>
      <div className="bars">
        {aggregate.counts.map((c, i) => (
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
