# b1141-likert-poll

The `likert-response-single-question` GEDL model. The essential interaction is now a **paired pre-reveal commitment**:

1. the student gives their own position on a bounded scale;
2. the student predicts where the rest of the class will land on the same scale;
3. both are committed before the cohort result is revealed;
4. the reveal compares the actual class distribution with the distribution of class predictions.

This adds productive anticipation without points, competition or surface gamification: students are waiting to discover not only **who agrees with me?** but **was my model of the room accurate?**

## Structure

```text
backend/            Express + Postgres
  server.js
  schema.sql         Tables + Week One seed
  .env.example
frontend/            React + HashRouter
  src/
    Respond.jsx       /#/respond/{id} — student view
    Control.jsx       /#/control/{id} — lecturer controls
    Display.jsx       /#/display/{id} — projector / presentation view
    styles.css
docker-compose.yml    Local testing
```

## Core interaction semantics

Each live response contains:

- `value` — the student's own judgement;
- `prediction` — where they expect the class overall to land.

The prediction is not a disposable second poll. It is a **prior commitment**. Once the cohort result becomes visible, the backend freezes the prediction for that participant token. A student may still reconsider their own substantive view, but cannot rewrite the prediction after seeing the room.

The aggregate therefore exposes two linked distributions:

- **what the class thought**;
- **what the class expected the class to think**.

It also returns the mean of each, allowing the interface to show the gap between actual and expected cohort position.

## Persistence

Controlled by `PERSIST_RESPONSES`.

- `false` (default) — responses live only in memory for the current session.
- `true` — every submission is also written to `responses`.

Persisted rows now contain `value` and `predicted_value`. `server.js` runs a safe `ALTER TABLE ... ADD COLUMN IF NOT EXISTS predicted_value` on startup so an existing deployment migrates automatically. Historical rows created before this change simply retain `NULL` in that column.

The anonymous activity-scoped browser token is used only to recognise revision within a short classroom session. It is not a student identity.

## Routes

- `/#/respond/{activity-id}` — student view. Students answer **What do you think?** and **Where do you think the rest of the class will land overall?**, then lock both in.
- `/#/control/{activity-id}` — lecturer view. Shows live response count, actual mean, predicted mean, both distributions, reveal control and session clear.
- `/#/display/{activity-id}` — large projector view, following the presentation pattern established in the ranking/reconsideration app. Opens separately from the control screen, auto-refreshes and includes a browser fullscreen button.

For Week One:

```text
/#/respond/b1141-w1-if-sport-disappeared
/#/control/b1141-w1-if-sport-disappeared
/#/display/b1141-w1-if-sport-disappeared
```

Before reveal, the projector screen shows the question, response count and a holding state while both distributions remain hidden. After reveal it shows the actual and predicted class distributions side by side, with the actual mean, predicted mean and expectation gap.

## Reveal behaviour

Existing activity config continues to determine reveal timing:

- `immediate`
- `threshold`
- `manual`

For threshold or manual activities, students see neither class distribution until the reveal condition is met. The lecturer can always use **Reveal now** from the control view.

## Database setup

```sql
CREATE DATABASE b1141_likert_poll;
```

Then:

```bash
psql "postgres://postgres:<password>@<host>:5432/b1141_likert_poll" -f backend/schema.sql
```

The schema seeds:

`b1141-w1-if-sport-disappeared`

with the statement:

> Sport exists more for individuals than for society.

Future content remains database-configured: new activity instances can be added with `INSERT` statements without rebuilding the app.

Per the standing convention, use a fresh database for each academic year rather than truncating and reusing the previous year's research data.

## Running locally

Copy `backend/.env.example` to `backend/.env`, set `DATABASE_URL`, then:

```bash
docker compose up --build
```

- Student: `http://localhost:5173/#/respond/b1141-w1-if-sport-disappeared`
- Lecturer: `http://localhost:5173/#/control/b1141-w1-if-sport-disappeared`
- Projector: `http://localhost:5173/#/display/b1141-w1-if-sport-disappeared`
- API health: `http://localhost:4000/api/health`

## Deployment

The repo retains the established GEDL deployment pattern:

1. backend from `/backend`, port 4000;
2. frontend from `/frontend`, static `/dist`;
3. `DATABASE_URL`, `PORT`, `ALLOWED_ORIGINS`, `PERSIST_RESPONSES` on the backend;
4. `VITE_API_BASE` available at frontend build time.

`ALLOWED_ORIGINS=*` is handled explicitly in `server.js` to avoid the earlier wildcard-splitting CORS bug.

HashRouter remains deliberate: Coolify static hosting has no server-side rewrite rule, so direct BrowserRouter routes would 404.
