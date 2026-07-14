# Pondview Pool Status

A live, resident-facing dashboard for the community pool at Pondview Estates (Wharton, NJ). Residents can check how busy the pool is right now, find the best times to visit, and see current conditions — before walking over with a towel.

Built with Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS.

## What residents see

- **Live status hero** — current crowd level, estimated occupancy %, capacity bar, and a data-driven "typically quieter after 4 PM"-style hint when it's busy.
- **Best Times to Visit** — an hourly activity chart with Today / Yesterday / Weekly avg. tabs. Future hours render as ghost bars projected from the weekly average; on mobile the chart scrolls horizontally with a progress indicator and a one-time sweep to hint at scrollability.
- **Live Pool Conditions** — crowd level, trend (rising / falling / steady), air & water temperature, UV index, and pool hours.
- **This Week's Usage** — quietest time, peak day, and most popular time, aggregated from the last 7 days.

The site is schedule-aware (shows Closed outside pool hours) and every section degrades gracefully to "not enough data yet" states when readings are missing.

## Data pipeline

```
Camera / CV process ──POST /api/sensor-reading──▶ Postgres (occupancy_readings)
                                                        │
Open-Meteo (weather, no key) ──┐                        │ aggregates
Upstash Redis (admin override) ─┼──▶ GET /api/pool-data ─┴──▶ dashboard (polls)
```

- **Occupancy readings** are POSTed by an on-site camera process and stored in Postgres. All aggregates (hourly curves, weekly stats, trend) are computed from this table.
- **Weather** (air temp, UV) comes from Open-Meteo — no API key, cached ~10 min.
- **Admin override** (force-close with a reason) lives in Upstash Redis and takes precedence over the schedule.
- The schema is bootstrapped automatically on first use — no migration step.

## Usage

```bash
npm install
npm run dev
```

The app runs without any configuration — you'll just see the empty "awaiting data" states. To light everything up, create `.env.local`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Neon, Supabase, Railway, …). Powers occupancy history and all aggregates. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Stores the admin open/closed override. |
| `ADMIN_PASSWORD` | Password for the admin panel at `/admin/login`. |
| `SENSOR_API_KEY` | Bearer token the camera must send to `POST /api/sensor-reading`. |

In development, missing vars are tolerated (queries return empty, admin/sensor auth is skipped or fails closed). In production, `DATABASE_URL` is required.

### Seed demo data

With `DATABASE_URL` set, generate a week of plausible readings so the charts have something to show:

```bash
node scripts/seed-readings.mjs           # last 7 days
node scripts/seed-readings.mjs --days 14 # more history
node scripts/seed-readings.mjs --reset   # truncate first
```

## API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/pool-data` | GET | Full dashboard snapshot: status, conditions, hourly activity, weekly usage. Polled by the client. |
| `/api/pool-status` | GET | Admin open/closed override state. |
| `/api/sensor-reading` | POST | Ingest an occupancy reading. `Authorization: Bearer <SENSOR_API_KEY>`, body `{ "occupancy": 17, "recordedAt"?: ISO }`. |
| `/api/admin-auth` | POST | Admin login (sets an auth cookie). |
| `/api/admin-readings` | GET / POST / PATCH / DELETE | Admin CRUD over raw occupancy readings (powers the data editor). Requires an admin session. |

## Admin panel

`/admin/login` gates the admin area (auth via an HMAC-signed cookie derived from `ADMIN_PASSWORD`).

- **`/admin/pool`** — force-close the pool with a resident-facing reason (e.g. maintenance, weather). The override takes effect on residents' screens within a few seconds and always wins over the schedule.
- **`/admin/data`** — a spreadsheet-style editor for the raw `occupancy_readings` table (the camera feed / seeded data). View, edit, delete, and insert readings; the dashboard's charts and stats recompute from this table. Requires `DATABASE_URL`.

## Configuration

Pool facts live in [lib/config.ts](lib/config.ts): capacity, timezone, coordinates (used for weather), open hours (10 AM–8 PM), sensor cadence, and freshness/trend windows. Change the pool's location or hours there — everything else derives from it.

All time math is done in the pool's local timezone (`America/New_York`) via [lib/time.ts](lib/time.ts), regardless of where the server or visitor is.

## Project structure

```
app/
  page.tsx              # resident dashboard
  admin/                # login + pool controls
  api/                  # pool-data, pool-status, sensor-reading, admin-auth
components/             # hero-status, best-times-chart, live-conditions, weekly-usage, …
hooks/                  # client polling + scroll restoration
lib/                    # config, db, aggregates, weather, auth, effective status
scripts/seed-readings.mjs
```

## Deployment

Deploys as a standard Next.js app (built for Vercel — includes Speed Insights). Set the four environment variables above; the `occupancy_readings` table and index are created automatically on first request.
