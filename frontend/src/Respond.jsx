import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";

const API = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function Respond() {
  const { id } = useParams();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [aggregate, setAggregate] = useState(null);

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

    if (localStorage.getItem(`likert-submitted-${id}`)) {
      setSubmitted(true);
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
      body: JSON.stringify({ value: selected }),
    });
    if (res.ok) {
      localStorage.setItem(`likert-submitted-${id}`, "1");
      setSubmitted(true);
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

  if (submitted) {
    return (
      <div className="wrap">
        <h1>{config.statement}</h1>
        <p className="muted">Thanks — your response has been recorded.</p>
        {aggregate?.revealed ? (
          <AggregateView aggregate={aggregate} />
        ) : (
          <p className="muted">
            Results will appear once enough of the class has responded.
          </p>
        )}
      </div>
    );
  }

  const points = Array.from({ length: config.scale_points }, (_, i) => i + 1);

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
              onClick={() => setSelected(p)}
              aria-pressed={selected === p}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <button className="submit" disabled={selected === null} onClick={submit}>
        Submit
      </button>
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
