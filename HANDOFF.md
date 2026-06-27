# Pondview Pool Status — Session Handoff

This document exists so a fresh Claude Code session (or a fresh teammate) can pick up the project without re-deriving context. Read it before making changes. Last updated by the previous session — keep it current if you make significant changes.

---

## 1. Project at a glance

A live, resident-facing web dashboard for the pool at **Pondview Estates (New Jersey)**. Residents open the site to see whether the pool is busy, how full it is, what the weather's doing, and what the historical activity looks like. The leasing office can force the pool closed for maintenance / special closures.

- **Deployed at**: a Vercel project owned by the user. Linked from the property site at https://pondviewestatesnj.com (the dashboard footer links back to /contact/).
- **GitHub**: `isaacwillson/Pondview-Pool-Status` on the `master` branch. PRs always target `master`.
- **Audience**: residents (mostly mobile). The design is intentionally premium — Apple/Airbnb/Linear adjacent — because it's a real product the property manager will judge.
- **User profile**: the project owner is the resident, not a developer by trade. They follow along well but appreciate plain-language explanations and short answers. Match their tone.

---

## 2. Tech stack

| Layer | Tool |
|---|---|
| Framework | Next.js 15.1.11 (App Router) |
| Runtime | React 19, Node.js (server functions) |
| Styling | Tailwind 3.4, custom shadcn-style primitives in `components/ui` |
| Icons | `lucide-react` |
| Hosting | Vercel |
| Persistent KV | Upstash Redis (admin override state) |
| Postgres | Neon (occupancy time-series) |
| Weather | Open-Meteo (no API key, free tier) |
| Future camera | Eagle Eye Networks — not yet wired (see §10) |

**No client-side data libs** (no SWR, no React Query). Polling is via plain `useEffect + setInterval` in two custom hooks.

---

## 3. Data architecture — the four sources of truth

Every value on screen flows from exactly one of these. When debugging, trace upstream until you hit one.

| Source | Where it lives | What it owns | Mutation cadence |
|---|---|---|---|
| **Postgres** (Neon) | `DATABASE_URL` env var | `occupancy_readings` time-series (one row per ~5 min from the camera, eventually) | Frequent writes once the camera is wired |
| **Upstash Redis** | `UPSTASH_REDIS_REST_URL` + `_TOKEN` | The admin override: `{ isOpen, reason, lastChangedAt }` | Only when admin clicks Save |
| **Compile-time constants** | `lib/config.ts` | Pool hours, capacity, lat/lon, timezone, polling/freshness windows | Only via code change + redeploy |
| **Open-Meteo** | Public API, called from `lib/weather.ts` | Air temperature + UV index | 10-min cache; we hit them ~6×/hour total |

**The combined "what should the resident actually see" decision** comes from `lib/effective-status.ts` (`deriveEffectivePoolStatus`), which mixes the Upstash override with the schedule (config) and the current pool-local time.

---

## 4. File map (annotated)

```
app/                       Next.js App Router
  layout.tsx               Fonts + base layout
  page.tsx                 Resident dashboard (client component)
  globals.css              Tailwind base + custom keyframes (fade-in, bar-grow)
  admin/
    login/page.tsx         Server: redirects if already authed
    login/login-form.tsx   Client: POSTs to /api/admin-auth
    pool/page.tsx          Server: redirects if NOT authed; reads Upstash; passes to client
    pool/admin-pool-controls.tsx   Client: the "Force the pool closed" UI
  api/
    pool-data/route.ts        GET — composes the resident snapshot, edge-cached 30s
    pool-status/route.ts      GET (public, edge-cached 3s) + POST (admin-only) — Upstash
    admin-auth/route.ts       POST (login), DELETE (logout), GET (session check)
    sensor-reading/route.ts   POST (camera-only, Bearer SENSOR_API_KEY) — INSERT into Postgres

components/
  hero-status.tsx          The big "X% full" hero. Three render paths via early returns:
                             LiveHero / ClosedHero / EmptyHero, all wrapped in HeroShell.
                             ClosedHero + EmptyHero use HeroShell's `compact` (single-column)
                             layout and have NO "—%" occupancy block — only LiveHero shows the
                             number + CapacityBar. LiveHero has no decorative pills (removed);
                             its eyebrow pulse is always green.
  best-times-chart.tsx     The bar chart with Today/Yesterday/Weekly avg. tabs. Y-axis shows
                             25/50/75/100% scale; bars have hover tooltips (hour + % full +
                             crowd label). Card uses warm bg-sand-50.
  live-conditions.tsx      The 5-card row, on a 6-col lg grid: Crowd + Air Temp are the primary
                             tier (half-width each), Trend / UV / Pool Hours the secondary row.
  weekly-usage.tsx         The 4 analytics cards at the bottom (resident-friendly chip copy)
  site-header.tsx          Top nav + status pill. Open pill reads "Open" (green pulse); closed
                             pill reads "Closed by management" / "Outside pool hours". Secondary
                             nav links dim when the pool is closed.
  site-footer.tsx          One link to https://pondviewestatesnj.com/contact/ (target=_blank)
  live-pulse.tsx           The pulsing green dot used for "Live" indicators
  animated-number.tsx      Count-up animation via requestAnimationFrame
  ui/                      Shadcn-style primitives (Card/Badge/Button/Switch/Skeleton/Separator)

hooks/
  use-pool-data.ts         Polls /api/pool-data every 30s; revives status.lastUpdated to Date
  use-pool-status.ts       Polls /api/pool-status every 3s; exposes mutate() for admin

lib/                       Pure logic — no JSX, no React
  config.ts                The constants — see §6
  types.ts                 Shared shapes (PoolDataSnapshot, PoolStatus, PoolConditions, etc.)
  time.ts                  currentLocalHour() (Intl-based) + formatHourLabel()
  effective-status.ts      Combines admin override + schedule into one decision
  mock-data.ts             crowdLabel/crowdSubtitle/crowdLabelShort + buildConditions/buildSnapshot fallback
  pool-status.ts           Upstash read/write (server-only)
  pool-data-server.ts      Composes the resident snapshot from all sources (server-only)
  occupancy-history.ts     SQL queries — getLatestReading, getTrend, getTodayHourlyActivity, getWeeklyUsage, insertReading (server-only)
  db.ts                    postgres client; idempotent CREATE TABLE IF NOT EXISTS on first call
  weather.ts               Open-Meteo client with 4s timeout + hardcoded fallback
  admin-auth.ts            Constant-time password check + HMAC-signed cookie (key = ADMIN_PASSWORD)
  sensor-auth.ts           Constant-time bearer-token check (SENSOR_API_KEY)
  utils.ts                 cn() (clsx + tailwind-merge), formatRelativeTime, pctFull
```

---

## 5. Conventions you must honor

### 5.1 Time is always in pool-local time, never the host's

- **Never** use `new Date().getHours()`, `.setHours()`, or `Date.now()` arithmetic against config hours. The server runs in UTC on Vercel and that will silently break.
- Use `currentLocalHour()` from `lib/time.ts` for "what hour is it right now."
- Use `formatHourLabel(hour: number)` to render `10` → `"10 AM"`.
- SQL queries that bucket by hour-of-day use `AT TIME ZONE ${POOL_TIMEZONE}` — see `lib/occupancy-history.ts` for the pattern.

### 5.2 `import "server-only"` at the top of any file that reads secrets

`lib/pool-status.ts`, `lib/occupancy-history.ts`, `lib/db.ts`, `lib/admin-auth.ts`, `lib/sensor-auth.ts`, `lib/weather.ts`, `lib/pool-data-server.ts` all do this. If a client component needs a *type* from one of these, use `import type { ... }` — types are erased at runtime so it's safe.

### 5.3 Schedule beats default-open; admin force-close beats schedule

The precedence in `deriveEffectivePoolStatus`:
1. **`adminStatus.isOpen === false`** → force-closed by admin. Reason = admin's text.
2. **Outside `POOL_OPEN_HOUR`..`POOL_CLOSE_HOUR`** → schedule-closed.
3. Otherwise → open.

The admin's `isOpen: true` is **not** an override — it just means "no override." There is no way to force the pool open outside its hours, and that's intentional (per user request).

The two closed states have different copy throughout the UI ("Closed by management" vs "Outside pool hours", with the schedule case spelling out "Opens today/tomorrow at 10 AM"). Keep that distinction whenever you add anything closed-state-aware.

### 5.4 Snapshot composition

`lib/pool-data-server.ts::buildLiveSnapshot()` is the only place that assembles `PoolDataSnapshot`. If you add a new piece of data:
1. Add the type to `lib/types.ts`.
2. Add the query (or fetch) to `lib/occupancy-history.ts` (or a new file).
3. Call it in `buildLiveSnapshot()`'s `Promise.all`.
4. Pass it to the component in `app/page.tsx`.
5. Update the `buildSnapshot()` mock fallback in `lib/mock-data.ts` so local dev without DB still works.

---

## 6. The constants in `lib/config.ts`

```ts
POOL_CAPACITY = 60                  // denominator of "X% full"
POOL_TIMEZONE = "America/New_York"  // used everywhere time-related
POOL_LAT = 40.898                   // NJ — used for Open-Meteo
POOL_LON = -74.5719
POOL_OPEN_HOUR = 10                 // 10 AM
POOL_CLOSE_HOUR = 20                // 8 PM
SENSOR_INTERVAL_MS = 5 * 60_000     // 5-min camera cadence
FRESH_READING_WINDOW_MS = 30 * 60_000
TREND_WINDOW_MS = 30 * 60_000       // rising/falling/steady window
WEEKLY_USAGE_MIN_DAYS = 7           // gate for This Week's Usage cards
```

To change pool hours, location, capacity, or polling cadence → edit here, commit, redeploy. That's it.

---

## 7. Required environment variables

Stored in `.env.local` for dev (gitignored). `.env.example` documents the schema.

In Vercel: **Settings → Environment Variables**. Set the same five there.

| Variable | Used in | What happens if missing |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | `lib/pool-status.ts` | Local: falls back to in-memory + warns. Prod: hard-fails. |
| `UPSTASH_REDIS_REST_TOKEN` | `lib/pool-status.ts` | Same as above. |
| `DATABASE_URL` | `lib/db.ts` | Local: queries return empty + warns. Prod: hard-fails. |
| `ADMIN_PASSWORD` | `lib/admin-auth.ts` | Hard-fails (admin login broken). Rotating it invalidates all sessions. |
| `SENSOR_API_KEY` | `lib/sensor-auth.ts` | Hard-fails (camera POSTs rejected). Camera isn't wired yet so not a blocker today. |

---

## 8. Current implementation status

### 8.1 Deployed and working

- Resident dashboard with three render paths (live / closed / empty)
- Schedule-driven open/close (10 AM – 8 PM ET)
- Admin login at `/admin/login` + force-close UI at `/admin/pool`
- Open-Meteo weather (air temp + UV, 10-min cache + fallback)
- Pool Hours card with `hoursLeftToday` computed in pool timezone
- Dynamic hero subtitle that matches the crowd level (via `crowdSubtitle()`)
- Custom bar chart "Best Times to Visit" with three tabs (Today / Yesterday / Weekly avg.), a
  25/50/75/100% Y-axis scale, and per-bar hover tooltips (hour + % full + crowd label)
- 4-card "This Week's Usage" with "Not enough data yet" placeholders when < 7 days of data
- Header pill, hero subtitle, and Pool Hours card all distinguish admin-closed vs schedule-closed
- `/api/sensor-reading` endpoint ready to receive camera POSTs (auth + validation done; nothing posting to it yet)

**UI polish pass (PRs #8–#11, see §9).** A resident-facing design review drove a round of cleanup:
closed/standby heroes are single-column with no broken-looking "—%"; schedule-closed copy reads
"Opens today/tomorrow at 10 AM"; system/admin language ("Deck sensor · A2", "Status set by: Pool
schedule") was stripped; the live indicator is consistently green; LiveHero lost its decorative
pills; Live Conditions gained a Crowd + Air Temp primary tier; the chart got a Y-axis scale + %
tooltips + warm background; Insights copy was de-jargoned. If you touch these areas, read the
relevant PR before "fixing" something back to its old form.

### 8.2 In flight at the moment of this handoff

Everything is committed. **PR #11 (`best-times-chart-polish`) is open and awaiting merge** — the
chart Y-axis/tooltips/warm-bg + Insights copy changes. PRs #8, #9, #10 are already merged to master.

The only un-shipped design-review item is the **footer** (Minor): the lone "Leasing Office" link is
visually orphaned and would benefit from surrounding context (a short label / hours / "Questions?
Contact us"). Lives in `components/site-footer.tsx`. Discussed with the user; not yet started.

### 8.3 Not yet implemented

- **Live occupancy data** — the dashboard hero is in "Standing by — Awaiting sensor data" empty state. Will graduate to live once the camera starts POSTing readings.
- **Camera CV pipeline** — see §10 for the current real-world blocker.

---

## 9. PR history (for context)

Merged into master so far:

1. Initial scaffolding + UI components
2. **#3** — Admin pool controls + Upstash + auth
3. **#4** — Live weather (Open-Meteo)
4. **#5** — Schedule-driven hours + admin as override (also fixed a timezone bug where Pool Hours rendered as 6 AM – 4 PM)
5. **#6** — Dynamic hero subtitle keyed to crowd level
6. **#7** — Wire Today / Yesterday / Weekly avg chart tabs
7. **#8** — Closed-state cleanup (de-dupe copy, "Opens today/tomorrow at 10 AM", drop "—%", dim nav when closed)
8. **#9** — Remove system-language leaks ("Deck sensor · A2", "Status set by: Pool schedule"; pill → "Open")
9. **#10** — Hero + Live Conditions hierarchy (green pulse everywhere, thicker capacity bar, tighter hero spacing, Crowd+Temp primary tier, removed LiveHero pills)
10. **#11** — Best Times chart + Insights polish (Y-axis scale, % tooltips, warm bg, "Busier than usual" copy)

These four polish PRs (#8–#11) came out of a resident-facing design review. The footer item is the
only review point still untouched (see §8.2).

---

## 10. The camera situation (current blocker for live data)

The pool has an **Eagle Eye Networks** turret/mini-dome camera. EEN is a cloud-managed VMS — the camera already streams to their cloud, which is great news: we don't need any on-prem hardware to get frames out of it.

### What's been asked of the property manager

The user has spoken with the property manager. The pending asks are:

1. **Create a user account** in the EEN dashboard with view-only access to *just* the pool camera. Send the credentials.
2. **The camera's ESN** (Eagle Eye's device ID — shown in camera settings).
3. **Confirm API access is enabled** on their EEN plan (this is the unknown — some tiers don't include it). If not, ask what it costs to enable. Also worth asking whether their plan includes **analytics features like people counting** — if yes, we don't need to build CV at all and can just pull the count.

### What we'll build once we have credentials

A Vercel cron job (every 5 minutes):
- Calls EEN's REST API with `EAGLE_EYE_CLIENT_ID` + `EAGLE_EYE_SECRET` env vars.
- For `EAGLE_EYE_CAMERA_ESN`, either:
  - Pulls a snapshot and runs CV in the cloud (Modal/Replicate for ~$0.30/mo at this cadence), or
  - Pulls EEN's built-in people count directly if their plan has analytics.
- POSTs the integer to `/api/sensor-reading` with our `SENSOR_API_KEY`.

The user has been told to test EEN credentials themselves with a quick `curl` before bothering the property manager about API access — see the conversation history for the exact one-liner.

### Privacy posture (already discussed with user, baked into plan)

No frames, no crops ever leave Eagle Eye's cloud or land in our infrastructure. The only thing flowing in is `{ "occupancy": <int> }`. Maintain this stance in any future implementation — it's load-bearing for the resident relationship.

### Bigger architectural pivot to remember

The user pivoted the CV mental model from **counting people** to **counting taken seats** (because towels-on-empty-loungers are functionally "taken"). They also pointed out that **chairs at this pool move**, so we can't pre-define seat polygons — the right architecture is:

1. Detect each chair in the frame dynamically (open-vocab detector or a fine-tuned chair detector).
2. For each detected chair, run a small binary classifier (available vs taken).
3. Sum availables → that's the integer we POST to `/api/sensor-reading`.

The classifier should be **trained on chair crops with binary labels (available vs taken)**, not on specific objects like "towel" or "bag." The model generalizes "what taken looks like" from examples.

Do *not* re-litigate this with the user unless they bring it up — they've thought it through and it's a settled direction.

---

## 11. Operational details

### Local dev

```powershell
npm install
copy .env.example .env.local   # then fill in the 5 values
npm run dev                    # next dev on port 3000
```

`.env.local` already exists for the user with their credentials filled in. **Don't commit it** — it's gitignored.

If `DATABASE_URL` is empty, you'll see "Standing by" empty states. That's correct — no DB, no readings, no data. The page should still look polished in that state.

If `UPSTASH_REDIS_REST_URL` is empty, admin actions work but don't persist across server restarts.

### Build

```powershell
npx next build
```

Build must pass before any commit. TypeScript errors block deploys.

### Deploy

Pushes to `master` auto-deploy via Vercel. Each PR gets a preview URL.

### Verifying changes in the browser (during a session)

Two `mcp__Claude_Preview__*` tools are available: `preview_start`, `preview_screenshot`, `preview_eval`, etc. `.claude/launch.json` defines the `pondview-dev` config that runs `npm run dev` on port 3717.

For browser-observable changes, the workflow is:
1. `preview_start({ name: "pondview-dev" })`
2. Wait ~4s for compile + first poll
3. `preview_screenshot` to verify
4. `preview_eval` to mutate or inspect state when needed
5. `preview_stop` when done

To verify chart/data states without real DB rows, monkey-patch `window.fetch` via `preview_eval` to return canned `/api/pool-data` payloads. The previous session used this pattern; it works well.

---

## 12. Common debugging recipes

| Symptom | First place to look |
|---|---|
| "Pool Hours shows wrong times" | Timezone bug. Search for `.getHours(` or `.setHours(` — there should be none. Confirm `POOL_TIMEZONE` is `"America/New_York"`. |
| "Admin save doesn't propagate to residents" | Cache. The GET on `/api/pool-status` is edge-cached for 3s; full propagation can take ~3–6s. Network tab in DevTools should show polls every 3s. |
| "Hero stuck on 'Standing by'" | No readings in `occupancy_readings`. Hit Neon's web console: `SELECT count(*) FROM occupancy_readings`. If 0, the camera isn't (yet) POSTing. |
| "Build fails on Vercel" | Run `npx next build` locally — same errors, faster feedback. |
| "Weather looks wrong" | 10-min cache. Hard refresh + wait. If still wrong, check `POOL_LAT`/`POOL_LON`. Hardcoded fallback is `{ airTempF: 84, uvIndex: 7 }` — seeing exactly that = API call is failing. |
| "Everything is skeletons forever" | JS bundle isn't loading. Console will show why. Common cause: accidentally importing a server-only file from a client component without `import type`. |

---

## 13. User-preference reminders

- Short, conversational answers. The user isn't a developer but follows along well.
- They appreciate when you explain *why*, not just *what*.
- They will sometimes revert your work if you over-implement or guess wrong about scope. When in doubt, ask first.
- They prefer one focused PR per logical change, with a clear title and a "Test plan" section in the body.
- For PRs: the `gh` CLI is installed locally (v2.94.0+). PR body should go through a temp file with `--body-file` because PowerShell mangles inline `--body` with em-dashes / quotes.

---

## 14. Glossary

| Term | Meaning in this project |
|---|---|
| **Admin** | The property manager / leasing office. Singular, no multi-user. Authenticated via `ADMIN_PASSWORD`. |
| **Effective status** | The result of `deriveEffectivePoolStatus(adminStatus)` — combines override + schedule. This is what residents actually see. |
| **Force-close override** | What the admin toggle does. Internal state: `isOpen: false` in Upstash. UI label: "Force the pool closed." |
| **Schedule-closed** | The pool is closed because the current pool-local time is outside `POOL_OPEN_HOUR`..`POOL_CLOSE_HOUR`. Resident sees "Outside pool hours" / "Closed for the day". |
| **Standing by** | The hero's empty state when there are zero sensor readings yet. Different from closed — implies "we're ready, just waiting for data." |
| **HourlyActivitySet** | The three-period chart payload: `{ today, yesterday, average }`. Each can be null independently. |
| **Effective source** | `"admin" | "schedule" | null` — which subsystem decided the pool is closed, so the UI can use different copy. |
| **ESN** | Eagle Eye Networks device ID for a specific camera. Alphanumeric, ~8 chars. |
| **Sensor** | The camera + CV pipeline that will eventually POST occupancy. Not built yet — see §10. |

---

## 15. When in doubt

- Read `app/page.tsx` first — it's the entry point and shows you how every piece slots together.
- For data flow, trace from a screen value backwards through `app/page.tsx → hooks → api routes → lib/*`.
- For visual decisions, check `tailwind.config.ts` for the brand palette (`pond.*` colors) and `globals.css` for keyframes.
- If a change feels like it's spanning many files, you might be designing a new abstraction — pause and check with the user before going wide.

This document is the contract between this session and the next one. If you change something fundamental — add a new env var, swap a data source, restructure the snapshot — update the matching section here.
