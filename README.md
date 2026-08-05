# b1141-likert-poll

The `likert-response-single-question` GEDL model, built to match the
`dummy-live-likert-poll` template and conventions: one repo, `/backend` +
`/frontend`, HashRouter, the known CORS fix, Postgres for both config and
(optionally) persisted responses.

## Structure

```
backend/           Express + Postgres
  server.js
  schema.sql        Run once to create tables + seed Week One
  .env.example
frontend/           React, one app, two routes
  src/
    Respond.jsx      /#/respond/{id} — student view
    Control.jsx       /#/control — lecturer view, Option A shell target
    styles.css
docker-compose.yml   Local testing
```

## Why config lives in Postgres now, not a JSON file

Earlier drafts of this pipeline used a bundled JSON file for the question
config. That's been dropped in favour of Postgres, in line with the
established convention that Postgres is where "questions" and "responses"
both live — this also means adding a future week's poll is a `psql` insert
against the live database, not a code change requiring a rebuild.

## Persistence

Controlled by one backend env var: `PERSIST_RESPONSES`.

- `false` (default) — responses live only in memory for the duration of a
  session, matching the original ephemeral position while ethics approval
  is pending.
- `true` — every submitted response is also written to the `responses`
  table (activity id, value, timestamp — nothing else, no student
  identifier). The in-memory session store still drives the live "this
  lecture, right now" view and "clear session" only resets that — it never
  deletes persisted rows.

Flip the flag and redeploy the backend to change this later; nothing else
in the code needs to change either direction.

## Routes

- `/#/respond/{activity-id}` — what students open. Reads the id from the
  URL, fetches config from Postgres via the backend, renders the scale,
  submits, polls the aggregate once submitted and revealed.
- `/#/control/{activity-id}` — what you open, one activity at a time.
  Same id-based pattern as the respond route, deliberately: no picker or
  activity list, since with one activity live at a time that's unneeded
  complexity. Shows the live aggregate for that one activity, with
  "Reveal now" and "Clear session" controls. For Week One:
  `/#/control/b1141-w1-if-sport-disappeared`.

HashRouter is used throughout (not BrowserRouter) — Coolify's static
hosting has no server-side rewrite rule, so direct navigation to a
BrowserRouter route 404s. This was hit and fixed once already on the
dummy project; baking it in from the start here avoids repeating it.

## Setting up the database

```sql
CREATE DATABASE b1141_likert_poll;
```

Then, connected to that database:

```bash
psql "postgres://postgres:<password>@<host>:5432/b1141_likert_poll" -f backend/schema.sql
```

This creates `activities` and `responses`, and seeds the Week One instance
(`b1141-w1-if-sport-disappeared`). Add future weeks with further `INSERT`
statements against `activities` — no redeploy needed for content changes,
only for changes to the app itself.

Per the standing convention: never truncate or reuse this database across
academic years. Create `b1141_likert_poll_2027_28` etc. for future years
and point that year's backend at the new one, so prior years' response
data survives intact for longitudinal analysis.

## Running locally

Copy `backend/.env.example` to `backend/.env` and point `DATABASE_URL` at
the real (public) Postgres URL on the Hetzner box — there's no local
Postgres in this compose file, by design, matching how local testing is
done elsewhere in this setup.

```bash
docker compose up --build
```

- Student view: `http://localhost:5173/#/respond/b1141-w1-if-sport-disappeared`
- Control view: `http://localhost:5173/#/control/b1141-w1-if-sport-disappeared`
- API health: `http://localhost:4000/api/health`

## Deploying to Coolify

Follow the repeatable workflow in `GEDL_Infrastructure_Reference.md`
exactly — this repo is built to match it:

1. Push this repo to `github.com/allanhewitt/b1141-likert-poll`
2. Create the database and run `schema.sql` (above)
3. Deploy backend: Base Directory `/backend`, port 4000, not a static
   site. Environment variables: `DATABASE_URL` (internal Postgres URL this
   time), `PORT=4000`, `ALLOWED_ORIGINS` (care needed — see the CORS note
   below), `PERSIST_RESPONSES`.
4. Deploy frontend: Base Directory `/frontend`, Publish Directory `/dist`,
   port 80, tick "Is it a static site?". `VITE_API_BASE` set as **Available
   at Buildtime**, pointing at the backend's deployed URL.

### CORS note

The `ALLOWED_ORIGINS` fix from the dummy project is already baked into
`server.js` — a literal `*` env value is passed straight through to the
`cors` package rather than being split into `["*"]`, which the package
would silently treat as an empty allow-list. Set `ALLOWED_ORIGINS=*` for
now unless you want to lock it to the frontend's specific deployed origin.

## Option A control shell (future work)

Longer term you want one control panel across all activity types in a
lecture, not one per model. For now, with a single activity, `/control/{id}`
stays deliberately simple — no picker, no cross-week list. Once two or
three models exist, the agreed path is a small shell app that steps
through a week's activities in delivery order, embedding each model's
`/control/{id}` view (`iframe` per activity, "next" to advance). This
route's id-based pattern is what makes that embeddable without changes
later — the shell just needs to know which id to point at.
