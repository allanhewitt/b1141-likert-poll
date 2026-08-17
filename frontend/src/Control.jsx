import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";

const API = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function Control() {
  const { id } = useParams();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [aggregate, setAggregate] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/config/likert/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("This activity does not exist.");
        return r.json();
      })
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, [id]);

  const fetchAggregate = useCallback(() => {
    fetch(`${API}/api/aggregate/likert/${id}`)
      .then((r) => r.json())
      .then(setAggregate)
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    fetchAggregate();
    const interval = setInterval(fetchAggregate, 2000);
    return () => clearInterval(interval);
  }, [fetchAggregate]);

  const reveal = () =>
    fetch(`${API}/api/session/${id}/reveal`, { method: "POST" }).then(fetchAggregate);

  const clear = () => {
    if (!window.confirm("Clear all responses for this activity's live view?")) return;
    fetch(`${API}/api/session/${id}/clear`, { method: "POST" }).then(fetchAggregate);
  };

  if (error) return <div className="wrap"><p className="error">{error}</p></div>;
  if (!config) return <div className="wrap"><p className="muted">Loading…</p></div>;

  return (
    <div className="wrap control-wrap">
      <div className="activity-kicker">B1141 · Lecturer control · Week {config.week}</div>
      <h1>{config.statement}</h1>

      <div className="control-status-grid">
        <div><span>Responses</span><strong>{aggregate?.total ?? 0}{config.cohort_size ? ` / ~${config.cohort_size}` : ""}</strong></div>
        <div><span>Class average</span><strong>{fmt(aggregate?.mean)}</strong></div>
        <div><span>Average prediction</span><strong>{fmt(aggregate?.prediction_mean)}</strong></div>
        <div><span>Student reveal</span><strong>{aggregate?.revealed ? "Visible" : "Hidden"}</strong></div>
      </div>

      <div className="control-toolbar">
        <a className="projector-link" href={`#/display/${id}`} target="_blank" rel="noreferrer">
          Open projector display ↗
        </a>
        <div className="controls">
          <button onClick={reveal}>Reveal now</button>
          <button className="danger" onClick={clear}>Clear session</button>
        </div>
      </div>

      {aggregate && (
        <div className="control-distributions">
          <Distribution title="What the class thinks" counts={aggregate.counts} />
          <Distribution title="What students predict the class will think" counts={aggregate.prediction_counts || []} secondary />
        </div>
      )}

      <p className="muted small">
        Lecturer data auto-refreshes every 2 seconds. The projector display follows the same reveal state.
      </p>
    </div>
  );
}

function Distribution({ title, counts, secondary = false }) {
  const max = Math.max(1, ...(counts || [1]));
  return (
    <section className={`control-distribution${secondary ? " secondary" : ""}`}>
      <h2>{title}</h2>
      <div className="bars">
        {counts.map((c, idx) => (
          <div className="bar-row" key={idx}>
            <span className="bar-label">{idx + 1}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(c / max) * 100}%` }} />
            </div>
            <span className="bar-count">{c}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const fmt = (value) => value == null ? "—" : Number(value).toFixed(1);
