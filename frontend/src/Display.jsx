import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function FullscreenButton() {
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // Fullscreen may be blocked by the browser unless triggered directly.
    }
  };
  return <button className="display-fullscreen" onClick={toggleFullscreen}>⛶ Full screen</button>;
}

function ProgressBar({ value, max }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return <div className="display-progress"><span style={{ width: `${pct}%` }} /></div>;
}

function Distribution({ title, subtitle, counts, mean, secondary = false }) {
  const total = (counts || []).reduce((sum, value) => sum + value, 0);
  const max = Math.max(1, ...(counts || [1]));

  return (
    <section className={`display-distribution${secondary ? " secondary" : ""}`}>
      <div className="display-distribution-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="display-mean"><span>Average</span><strong>{mean == null ? "—" : Number(mean).toFixed(1)}</strong></div>
      </div>

      <div className="display-bars">
        {counts.map((count, index) => {
          const pct = total ? Math.round((count / total) * 100) : 0;
          return (
            <div className="display-bar-row" key={index}>
              <div className="display-scale-point">{index + 1}</div>
              <div className="display-bar-track">
                <div className="display-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <div className="display-bar-stat"><strong>{count}</strong><span>{pct}%</span></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Display() {
  const { id } = useParams();
  const [config, setConfig] = useState(null);
  const [aggregate, setAggregate] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/config/likert/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("This activity does not exist.");
        return r.json();
      })
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, [id]);

  const refresh = useCallback(() => {
    fetch(`${API}/api/aggregate/likert/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setAggregate(data); })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (error) return <div className="display-stage display-centred"><p className="error">{error}</p></div>;
  if (!config || !aggregate) return <div className="display-stage display-centred"><div className="display-kicker">B1141</div><h1>Loading class display…</h1></div>;

  if (!aggregate.revealed) {
    return (
      <div className="display-stage display-centred">
        <FullscreenButton />
        <div className="display-kicker">B1141 · Week {config.week} · Initial judgement</div>
        <h1 className="display-question">{config.statement}</h1>
        <p className="display-subtitle">What do you think — and where do you expect the rest of the class to land?</p>
        <div className="display-counter"><strong>{aggregate.total}</strong><span>paired responses received{config.cohort_size ? ` · about ${config.cohort_size} expected` : ""}</span></div>
        {config.cohort_size && <ProgressBar value={aggregate.total} max={config.cohort_size} />}
        <div className="display-hold">Both the class position and the class predictions remain hidden until the reveal.</div>
      </div>
    );
  }

  const gap = aggregate.mean == null || aggregate.prediction_mean == null
    ? null
    : aggregate.prediction_mean - aggregate.mean;

  return (
    <div className="display-stage display-reveal">
      <FullscreenButton />
      <header className="display-header">
        <div>
          <div className="display-kicker">B1141 · Week {config.week} · The reveal</div>
          <h1>{config.statement}</h1>
        </div>
        <div className="display-response-chip">{aggregate.total} responses</div>
      </header>

      <div className="display-summary-grid">
        <div className="display-summary-card"><span>Class average</span><strong>{fmt(aggregate.mean)}</strong><small>what we actually thought</small></div>
        <div className="display-summary-card"><span>Average prediction</span><strong>{fmt(aggregate.prediction_mean)}</strong><small>where we expected the class to land</small></div>
        <div className="display-summary-card"><span>Expectation gap</span><strong>{gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap.toFixed(1)}`}</strong><small>prediction minus actual</small></div>
      </div>

      <div className="display-distribution-grid">
        <Distribution
          title="What the class thought"
          subtitle="Our own judgements"
          counts={aggregate.counts}
          mean={aggregate.mean}
        />
        <Distribution
          title="What we expected the class to think"
          subtitle="Our predictions before seeing the room"
          counts={aggregate.prediction_counts || []}
          mean={aggregate.prediction_mean}
          secondary
        />
      </div>

      <div className="display-discussion-prompt">Were we better at judging the issue — or at judging <strong>one another</strong>?</div>
    </div>
  );
}

const fmt = (value) => value == null ? "—" : Number(value).toFixed(1);
