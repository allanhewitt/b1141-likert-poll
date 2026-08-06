import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";

const API = import.meta.env.VITE_API_BASE || "http://localhost:4000";

// One anonymous token per browser, reused across every poll. Not an
// identity — just enough for the backend to recognise "this is the same
// respondent revising an earlier answer" within a live session.
function getToken() {
  let token = localStorage.getItem("likert-token");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("likert-token", token);
  }
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
