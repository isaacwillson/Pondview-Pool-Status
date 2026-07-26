# Pondview Pool Status — Session Handoff

This document exists so a fresh Claude Code session (or a fresh teammate) can pick up the project without re-deriving context. Read it before making changes. **Keep it current** if you make significant changes.

> This branch (`handoff-doc`) is periodically merged up from `master` so it carries the real code alongside this doc. It is a *reference* branch — don't build features here; branch off `master`.

---

## 1. Project at a glance

A live, resident-facing web dashboard for the pool at **Pondview Estates (Wharton, New Jersey)**. Residents open the site to see whether the pool is busy, how full it is, the weather, and the historical activity pattern. The leasing office can force the pool closed for maintenance.

- **Deployed at**: a Vercel project owned by the user. Linked from the property site at https://pondviewestatesnj.com.
- **GitHub**: `isaacwillson/Pondview-Pool-Status`, default branch `master`. **PRs always target `master`.**
- **Audience**: residents, mostly on mobile. Design is intentionally premium (Apple/Airbnb/Linear adjacent) — it's a real product the property manager judges.
- **User profile**: the owner (Isaac) is the resident, **early-career and mostly vibecoded this project**. He's using it to genuinely learn Next.js / TypeScript / Tailwind and wants to defend it in interviews. **Explain the _why_ behind changes, teach as you go, and offer small scoped exercises he can do himself.** Short, plain-language answers.

### Current real-world status (important)

- **The camera is NOT connected yet.** There is no live occupancy feed. Occupancy readings are being **entered by hand** through the admin **data editor** (`/admin/data`) — see §8. Everything downstream already runs on that data.
- Because Isaac can only log data some days, occupancy is only tracked **Tuesday, Wednesday, Thursday & Saturday** (`POOL_TRACKING_DAYS`). The pool is open every day, but on untracked days the UI says so explicitly instead of showing a stale or fake number. See §5.5.

---

## 2. Tech stack

| Layer | Tool |
|---|---|
| Framework | Next.js 15.1.11 (App Router) |
| Runtime | React 19, Node.js (server functions) |
| Styling | Tailwind 3.4, custom shadcn-style primitives in `components/ui` |
| Icons | `lucide-react` |
| Hosting | Vercel (auto-deploy on push to `master`; PRs get preview URLs) |
| Persistent KV | Upstash Redis (admin override + demo-mode flag) |
| Postgres | Neon (`occupancy_readings` time-series) |
| Weather | Open-Meteo (no API key, free tier) |
| Analytics | **PostHog** (`posthog-js` client + `posthog-node` server) — added in PR #27 |
| Future camera | Eagle Eye Networks — not yet wired (see §10) |

**No client-side data libs** (no SWR/React Query). Polling is plain `useEffect + setInterval` in two custom hooks.

---

## 3. Data architecture — the sources of truth

Every value on screen flows from exactly one of these. When debugging, trace upstream until you hit one.

| Source | Where it lives | What it owns |
|---|---|---|
| **Postgres** (Neon) | `DATABASE_URL` | `occupancy_readings` time-series (one row per reading). All occupancy aggregates derive from this. |
| **Upstash Redis** | `UPSTASH_REDIS_REST_URL` + `_TOKEN` | Two tiny keys: the admin override (`pondview:pool-status`) and the demo-mode flag (`pondview:demo-mode`). |
| **Compile-time constants** | `lib/config.ts` | Pool hours, capacity, **tracking days**, lat/lon, timezone, freshness/trend windows. See §6. |
| **Open-Meteo** | Public API via `lib/weather.ts` | Air temperature + UV index (10-min cache + fallback). |

The **"what should the resident see"** open/closed decision is `lib/effective-status.ts::deriveEffectivePoolStatus` (admin override × schedule × pool-local time). The **whole snapshot** is assembled by `lib/pool-data-server.ts::buildLiveSnapshot`, unless **demo mode** is on (§8), in which case `/api/pool-data` serves `lib/mock-data.ts::buildSnapshot()` instead — no DB touched.

---

## 4. File map (annotated — current)

```
app/
  layout.tsx                Fonts + base layout; wraps children in <PHProvider> (PostHog)
  page.tsx                  Resident dashboard (client). Also calls useScrollRestoration().
  globals.css               Tailwind base + keyframes (fade-in-up, bar-grow); .stagger, .no-scrollbar
  admin/
    login/…                 Admin login (POSTs /api/admin-auth)
    pool/…                  "Force the pool closed" UI (Upstash override)
    data/page.tsx           Server: auth-gated; lists readings + reads demo flag
    data/data-table.tsx     Client: spreadsheet editor — add/edit/delete readings, search,
                              scroll window, and the DEMO MODE toggle
  api/
    pool-data/route.ts        GET — resident snapshot; serves demo snapshot when demo mode on
    pool-status/route.ts      GET (public) + POST (admin) — Upstash override
    admin-auth/route.ts       POST login / DELETE logout / GET session check
    admin-readings/route.ts   GET/POST/PATCH/DELETE — CRUD over occupancy_readings (admin-only)
    demo-mode/route.ts        GET/POST — toggle demo mode (admin-only)
    sensor-reading/route.ts   POST (camera-only, Bearer SENSOR_API_KEY) — built, not yet used

components/
  hero-status.tsx          The big hero. Render paths (open+fresh → LiveHero; open+untracked-day →
                             UntrackedHero; open+tracking-day-no-readings → JustOpenedHero "0%";
                             open+stale → PausedHero; closed → ClosedHero). LiveHero has a
                             data-driven "typically quieter after X" QuieterHint.
  best-times-chart.tsx     Today/Yesterday/Weekly-avg bar chart. Future hours = dashed ghost bars
                             from the weekly average. Mobile: horizontal scroll with edge fades +
                             a scroll-progress bar + a one-time "sweep" nudge on scroll-into-view.
                             Defaults to Weekly avg. on untracked days.
  live-conditions.tsx      Crowd / Trend / Air Temp / UV / Pool Hours cards. Pool Hours shows a
                             "Crowd levels tracked Tue–Thu & Sat" note; crowd/trend read
                             "Not tracked / Off today" on untracked days.
  weekly-usage.tsx         Quietest / Peak Day / Most Popular cards — FULLY data-driven now:
                             sparkline from dailyAverages, chips + captions derived from the data.
  site-header.tsx          Nav + status pill; IntersectionObserver scroll-spy highlights the
                             active section.
  site-footer.tsx          "Get Directions" + "Leasing Office" links.
  posthog-provider.tsx     Client PostHog init (PHProvider)
  live-pulse.tsx / animated-number.tsx / ui/*   Small primitives

hooks/
  use-pool-data.ts         Polls /api/pool-data every 30s; revives lastUpdated → Date
  use-pool-status.ts       Polls /api/pool-status every 3s; exposes mutate() for admin
  use-scroll-restoration.ts  Restores window scroll across reloads (height-aware; see §5.7)

lib/                       Pure logic — no JSX (mostly server-only)
  config.ts                The constants — see §6
  types.ts                 Shared shapes (PoolDataSnapshot, WeeklyUsage.dailyAverages, etc.)
  time.ts                  currentLocalHour, formatHourLabel, + tracking-day helpers
                             (currentLocalWeekday, isTrackingDay, nextTrackingDay,
                             formatTrackingDays, weekday{Long,Short}Name)
  effective-status.ts      Admin override × schedule → open/closed decision
  mock-data.ts             crowd label/subtitle helpers + buildConditions + buildSnapshot (demo)
  pool-status.ts           Upstash read/write for the admin override (server-only)
  demo-mode.ts             Upstash read/write for the demo-mode flag (server-only)
  pool-data-server.ts      buildLiveSnapshot — composes the snapshot; applies the staleness guard
  occupancy-history.ts     All SQL: latest reading, trend, hourly activity, weekly usage,
                             listReadings/createReading/updateReading/deleteReading (server-only)
  db.ts                    postgres client + CREATE TABLE IF NOT EXISTS; isDbConfigured()
  weather.ts               Open-Meteo client (4s timeout + fallback)
  admin-auth.ts / sensor-auth.ts   HMAC cookie / bearer-token auth (server-only)
  posthog-server.ts        Server-side PostHog client
  utils.ts                 cn(), formatRelativeTime, pctFull

scripts/seed-readings.mjs  Dev seed: N days of plausible readings (needs DATABASE_URL)
docs/                      README media (screenshots + GIFs)
```

---

## 5. Conventions you must honor

### 5.1 Time is always pool-local, never the host's
Never `new Date().getHours()` / `.setHours()` / `Date.now()` arithmetic against config hours — the server runs UTC on Vercel and it silently breaks. Use `currentLocalHour()` / `formatHourLabel()` from `lib/time.ts`. SQL buckets by hour/day with `AT TIME ZONE ${POOL_TIMEZONE}`. **This has bitten the project more than once.**

### 5.2 `import "server-only"` on any file touching secrets or the DB
All of `lib/{pool-status,demo-mode,occupancy-history,db,admin-auth,sensor-auth,weather,pool-data-server,posthog-server}.ts`. Client components importing a *type* from these must use `import type` (erased at runtime).

### 5.3 Open/closed precedence (`deriveEffectivePoolStatus`)
1. `adminStatus.isOpen === false` → force-closed by admin (reason = admin text).
2. Outside `POOL_OPEN_HOUR..POOL_CLOSE_HOUR` → schedule-closed ("Opens today/tomorrow at 10 AM").
3. Otherwise open. Admin `isOpen: true` is **not** an override — there's intentionally no way to force-open outside hours.

### 5.4 Snapshot composition
`buildLiveSnapshot()` is the only place that assembles `PoolDataSnapshot`. Adding data: (1) type in `lib/types.ts` → (2) query in `lib/occupancy-history.ts` → (3) call in `buildLiveSnapshot`'s `Promise.all` → (4) pass to component in `app/page.tsx` → (5) **also add it to `buildSnapshot()` in `lib/mock-data.ts`** so demo mode + no-DB dev stay coherent. (The Weekly Usage `dailyAverages` sparkline followed exactly this path.)

### 5.5 Tracking days vs open days
The pool is **open every day**; occupancy is **tracked** only on `POOL_TRACKING_DAYS` (Tue/Wed/Thu/Sat). Everything is driven by that one array:
- Hero: untracked day → "Open · live tracking off today" (+ next tracked day); tracking day, no readings yet → "Empty · 0%" opening baseline; tracking day, readings gone stale → "Live · paused".
- Live Conditions crowd/trend → "Not tracked / Off today"; Pool Hours shows the tracked-days line.
- Best Times defaults to Weekly avg. on untracked days.
- Weekly Usage names the tracked days and its gate is tracking-relative (§6).
- **When the camera goes live 7 days a week, set `POOL_TRACKING_DAYS` to all seven and this messaging disappears automatically.**

### 5.6 Staleness guard (wired up — don't undo it)
`buildLiveSnapshot` sets `status = null` when the newest reading is older than `FRESH_READING_WINDOW_MS`. This is what stops a Saturday reading from showing as "live" on Monday. `FRESH_READING_WINDOW_MS` used to be defined-but-unused; it is load-bearing now.

### 5.7 Scroll restoration
`useScrollRestoration()` (in `app/page.tsx`) takes over `history.scrollRestoration` and re-applies the saved position **after** content has loaded, polling the document height. It captures the target on mount (before the scroll listener can clobber it). Two earlier naive versions were buggy (bottom-section reloads landed on the wrong section; then everything landed at top). Don't "simplify" it back.

---

## 6. Constants in `lib/config.ts`

```ts
POOL_CAPACITY = 80                       // denominator of "X% full" (was 60; user changed it)
POOL_TIMEZONE = "America/New_York"
POOL_LAT = 40.898 ; POOL_LON = -74.5719  // NJ — Open-Meteo
POOL_OPEN_HOUR = 10 ; POOL_CLOSE_HOUR = 20   // 10 AM – 8 PM every day
POOL_TRACKING_DAYS = [2, 3, 4, 6]        // Tue, Wed, Thu, Sat (0=Sun … 6=Sat)
SENSOR_INTERVAL_MS = 5 * 60_000
FRESH_READING_WINDOW_MS = 30 * 60_000    // staleness guard (§5.6)
TREND_WINDOW_MS = 30 * 60_000
WEEKLY_USAGE_WINDOW_DAYS = 7             // trailing window for the usage gate
WEEKLY_USAGE_MIN_DAYS = 3                // ≥3 distinct days in that window → show the cards
```

The usage gate window/threshold are **separate on purpose**: a 4-day tracking week can never hit "7 distinct days in 7," so requiring that (the old behavior) meant the cards never appeared.

---

## 7. Environment variables

`.env.local` for dev (gitignored, already filled in for Isaac). Same set in Vercel → Settings → Environment Variables.

| Variable | Used in | Missing behavior |
|---|---|---|
| `DATABASE_URL` | `lib/db.ts` | Local: queries return empty + warn. Prod: hard-fail. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | `lib/pool-status.ts`, `lib/demo-mode.ts` | Local: in-memory fallback + warn. Prod: hard-fail. |
| `ADMIN_PASSWORD` | `lib/admin-auth.ts` | Admin login broken. Rotating it invalidates all sessions. |
| `SENSOR_API_KEY` | `lib/sensor-auth.ts` | Camera POSTs rejected. Not a blocker (camera not wired). |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` / `NEXT_PUBLIC_POSTHOG_HOST` | `components/posthog-provider.tsx`, `lib/posthog-server.ts` | Analytics silently no-op. |

Note `.claude/settings.local.json` is (now) gitignored — per-machine Claude Code permissions, don't commit it.

---

## 8. Implementation status

### 8.1 Deployed and working
- Resident dashboard with the full set of hero states (§5.5), schedule-driven open/close, admin force-close.
- **Admin data editor** at `/admin/data` — the current way readings get in: a spreadsheet-style table (add / edit / delete / search, fixed-height scroll window) over `occupancy_readings`. Requires `DATABASE_URL`.
- **Demo mode** — a toggle in `/admin/data` that makes the resident view serve a generated snapshot (nothing written to the DB); flip it off to return to live data. Flag lives in Upstash so every visitor's poll sees the same thing. This is also the way to preview the populated UI without a database (see §11).
- Best Times chart (ghost bars, mobile scroll affordances), Live Conditions, and **fully data-driven Weekly Usage** (stats, sparkline, chips, captions).
- Open-Meteo weather; scroll restoration; nav scroll-spy; PostHog analytics.
- `/api/sensor-reading` ready for the camera (auth + validation done).

### 8.2 Not yet implemented / pending
- **Live camera feed** (§10). Until then, **Isaac enters readings by hand in `/admin/data`.** This is the single most important current-state fact.
- Known cosmetic/tech debt: `lib/weather.ts` fallback comment still says "Austin" (location is NJ); no login rate-limiting; no CI (the build broke on master once this could have caught — a `tsc + lint + build` GitHub Action is the highest-value small add).

---

## 9. PR history since the last handoff (context)

The previous handoff stopped at PRs #8–#11 (a resident-facing UI polish pass). Since then, merged to `master`:

- **#12** — Batch UI polish: nav scroll-spy active state, 2×2 mobile conditions grid, UV "No sun protection needed", trend closed-state copy, spacing/footer, chart grid lines/tab states/date caption, Community Insights copy. (Three items — a prominent closed-reason line, a closed-hero illustration, and a Pool Hours day-timeline — were built then **reverted** at Isaac's request; don't re-add them.)
- **#14** — Fixed a build-breaking conditional `useState` in the chart (Rules-of-Hooks / SSR `window`); made scroll-edge fades mobile-only. Also fixed an off-by-one so the chart no longer shows a post-closing "8 PM–9 PM" bar.
- **#15 / #16** — Mobile chart scrollability: scroll-progress indicator + a one-time "sweep to end" nudge that fires when the chart scrolls into view.
- **#18 → #19** — Scroll restoration. #18 introduced a regression (always landed at top); #19 is the correct height-based version (§5.7).
- **#20 / #25** — README (content, then media/GIFs, then the "camera not connected" note).
- **#21** — Admin data editor + `/api/admin-readings` CRUD.
- **#22** — Demo mode + data-editor search + scroll window.
- **#24** — Distinct demo curves per chart tab.
- **#26 / #28 / #29** — Tracking-days system: `POOL_TRACKING_DAYS`, the untracked/just-opened/paused hero states, the staleness guard wired up, the Weekly Usage gate fix, and the **real per-weekday sparkline** + fully dynamic chips/captions.
- **#27** — PostHog analytics (added by Isaac / an automated integration, not hand-built here).

---

## 10. The camera situation (blocker for live data)

The pool has an **Eagle Eye Networks** camera (cloud-managed VMS — already streams to their cloud, so no on-prem hardware needed to get frames).

**Pending asks of the property manager:** a view-only EEN account for just the pool camera + credentials; the camera's **ESN**; and confirmation that **API access** (and ideally built-in **people-counting analytics**) is enabled on their plan.

**What we'll build once we have credentials:** a Vercel cron (~5 min) that calls EEN's API for the camera and either (a) pulls a snapshot → runs CV in the cloud (Modal/Replicate, ~$0.30/mo), or (b) pulls EEN's people count directly if the plan has analytics; then POSTs `{ "occupancy": <int> }` to `/api/sensor-reading` with `SENSOR_API_KEY`.

**Privacy posture (settled):** no frames/crops ever leave EEN's cloud or land in our infra — only the integer count flows in. This is load-bearing for the resident relationship.

**CV architecture (settled — don't re-litigate unless Isaac raises it):** count **taken seats**, not people (towels on empty loungers are functionally "taken"). Chairs move, so don't pre-define seat polygons: (1) detect each chair dynamically, (2) run a small binary available/taken classifier per chair crop, (3) sum takens → the integer we POST. Classifier is trained on chair crops with binary labels, not on "towel"/"bag" objects.

---

## 11. Operational details

**Local dev:** `npm install`, then `npm run dev`. Runs without any env vars — you'll see the "no data / just opened / untracked" states. To see the **populated** UI without a database, log into `/admin/login` and flip on **demo mode** in `/admin/data` (needs `ADMIN_PASSWORD`; Upstash falls back to in-memory in dev). With `DATABASE_URL` set, `node scripts/seed-readings.mjs` seeds a week of readings.

**Build:** `npx next build` (or `npx tsc --noEmit` for a fast type-only check) must pass before committing — TS errors block Vercel deploys.

**Verifying in the browser during a session:** the preview tooling in this environment has been the **`mcp__Claude_Browser__*`** tools (start a `pondview-dev` server via `.claude/launch.json` on port 3717, then `navigate` + `get_page_text` / `read_console_messages`). Screenshots have been flaky/timeout-prone all along — prefer `get_page_text` and DOM/console checks. Because there's usually no local DB, the resident view shows the tracking-day states; you can verify populated states by temporarily editing `POOL_TRACKING_DAYS`, or by checking `buildSnapshot()` output directly with Node (compile the module chain to CJS in a scratch dir — this pattern was used to verify chart curves and the weekly sparkline without a DB).

---

## 12. Common debugging recipes

| Symptom | First place to look |
|---|---|
| Hero says "live tracking off today" | Correct on Mon/Fri/Sun — that's an untracked day (`POOL_TRACKING_DAYS`). Not a bug. |
| Hero stuck on "Empty · 0% / just opened" during the day | Tracking day with no readings logged yet. Add readings in `/admin/data`, or (dev) it's just the no-DB state. |
| Pool Hours shows wrong times | Timezone bug — search for `.getHours(`/`.setHours(` (should be none); confirm `POOL_TIMEZONE`. |
| Weekly Usage never appears | Needs ≥3 distinct tracked days of readings in the last 7 (§6). With manual entry, log a few days. |
| Peak Day label ≠ tallest sparkline bar | Shouldn't happen — both derive from one per-weekday query in `getWeeklyUsage`. If it does, that invariant broke. |
| Admin save doesn't propagate | `/api/pool-status` GET is edge-cached ~3s; propagation ~3–6s. |
| Everything is skeletons forever | Client bundle failing — check console; common cause is importing a `server-only` file into a client component without `import type`. |
| Build fails on Vercel | Run `npx next build` / `npx tsc --noEmit` locally for the same error faster. |

---

## 13. Working-with-Isaac reminders

- Short, conversational, plain-language. He follows along but isn't a career dev — **explain the _why_**, and it's welcome to quiz him / offer small exercises on his own code (he's prepping to defend this project in interviews).
- He will **revert** work if you over-implement or guess scope wrong. When a change spans many files or adds an abstraction, check first.
- **One focused PR per logical change.** Clear title; a short "why + what + verification" body. He cares that PR descriptions stay accurate — update them (`gh pr edit`) when scope shifts (pushing code never updates the body).
- `gh` CLI is available. Every session this project has run: branch off `master` → build → `tsc`/verify → commit → push → open PR with `gh pr create`.
- End commit messages with the `Co-Authored-By: Claude …` trailer.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **Admin** | The property manager / leasing office. Single user, `ADMIN_PASSWORD`. |
| **Effective status** | Output of `deriveEffectivePoolStatus` — override × schedule; what residents see. |
| **Tracking day** | A day occupancy is measured (`POOL_TRACKING_DAYS` = Tue/Wed/Thu/Sat). The pool is open on other days too, just untracked. |
| **Demo mode** | Upstash flag; when on, `/api/pool-data` serves the generated `buildSnapshot()` — no DB writes. Toggle in `/admin/data`. |
| **Data editor** | `/admin/data` — the spreadsheet CRUD over `occupancy_readings`; currently the primary way readings get in. |
| **Staleness guard** | `FRESH_READING_WINDOW_MS` check in `buildLiveSnapshot` that nulls out old readings so they don't show as live. |
| **Just-opened / Paused / Untracked hero** | The three "open but no fresh reading" hero states (§5.5). |
| **HourlyActivitySet** | `{ today, yesterday, average }` chart payload; each can be null independently. |
| **ESN** | Eagle Eye Networks device ID for a camera. |

---

This document is the contract between this session and the next. If you change something fundamental — a new env var, a new data source, a restructured snapshot, a new config knob — update the matching section here before you finish.
