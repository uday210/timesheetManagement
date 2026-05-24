# Timesheet & ITSM Agentic Platform

A Next.js 16 + Supabase app (deployed on Railway) that powers two things, both
drivable from **Slack via Salesforce Agentforce agents**:

1. **Timesheet & Leave Portal** — log daily hours and apply for leave from a web
   UI, from Claude (MCP), or from Salesforce/Slack.
2. **ITSM Hardware Agent POC** — a Slack agent that remotely operates a physical
   **Epson ET‑2800 printer** (status, print, identify, scan, clear queue) via a
   cloud relay + a local connector (`printer-connector/`).

> 📄 **Full system documentation:** see [OVERVIEW.md](OVERVIEW.md) (also exported
> as a PDF). Connector docs: [printer-connector/README.md](../printer-connector/README.md).

Users are identified by **email** — no passwords. The timesheet data is reachable
three ways:

- **Web UI** — `/`
- **MCP server** — `/api/mcp` (for Claude / any MCP client)
- **REST API + OpenAPI** — `/api/timesheets`, described at `/api/openapi`
  (registered as Salesforce **External Services**)

Built with Next.js 16 (App Router) + Supabase (Postgres + Storage).

---

## How it works

A single table, `timesheet_entries`, stores `{ user_email, week_start, description, hours }`.
A "week" is normalized to the **Monday** of that week, so the same week always
groups together no matter which day you enter. All three interfaces share one
module (`src/lib/timesheet.ts`) so validation and behavior are identical.

The table has **Row Level Security enabled with no policies** — it is only
reachable with the Supabase **service-role** key, which lives server-side. The
browser never talks to Supabase directly; it goes through the `/api` routes.

---

## Setup

1. Install deps:
   ```bash
   npm install
   ```
2. Configure env. Copy `.env.example` → `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL` — already set to the project URL.
   - `SUPABASE_SERVICE_ROLE_KEY` — **required**. Supabase dashboard →
     Project Settings → API → `service_role` (secret).
3. Run:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

Create the `timesheet_entries` table by running the SQL in
[Database schema](#database-schema) once in your project's SQL Editor.

---

## Web UI

Enter your email once (stored in `localStorage`). Two tabs:

- **Timesheet** — a week navigator with all 7 days in a row; add hours +
  description per day, delete any entry, and **View all timesheets** for full
  history grouped by week with totals.
- **Leave** — apply for leave (date range, type, reason), see your requests with
  status, and cancel them.

Use **switch user** to change email.

---

## MCP

Endpoint: `POST /api/mcp` (stateless Streamable HTTP JSON-RPC).

Tools:

| Tool | Arguments | What it does |
| --- | --- | --- |
| `log_timesheet` | `email`*, `hours`*, `description`*, `date?`, `week?` | Logs hours for a day. |
| `list_timesheets` | `email`*, `week?` | Lists entries grouped by week with totals. |
| `apply_leave` | `email`*, `start_date`*, `end_date?`, `leave_type?`, `reason?` | Submits a leave request (status `pending`). |
| `list_leaves` | `email`* | Lists leave requests with status and day counts. |

`date` is a specific day (`2026-05-21`); if omitted, `week` is used (a date or
`this`/`last`/`next`, defaulting to the current week). The user is always
identified by `email`.

**Connect from Claude** — add to your MCP client config:

```json
{
  "mcpServers": {
    "timesheet": {
      "type": "http",
      "url": "https://YOUR-APP.up.railway.app/api/mcp"
    }
  }
}
```

Then ask, e.g. *"Log 8 hours on the timesheet for alice@acme.com this week,
description 'API integration'."*

Quick check with curl:

```bash
curl -s https://YOUR-APP.up.railway.app/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## REST API

| Method | Path | Body / query | Description |
| --- | --- | --- | --- |
| `GET` | `/api/timesheets` | `?email=&week=` | List grouped by week. |
| `POST` | `/api/timesheets` | `{ email, hours, description, date?, week? }` | Log an entry. |
| `DELETE` | `/api/timesheets/{id}` | `?email=` | Delete your own entry. |
| `GET` | `/api/leaves` | `?email=` | List leave requests. |
| `POST` | `/api/leaves` | `{ email, start_date, end_date?, leave_type?, reason? }` | Apply for leave. |
| `DELETE` | `/api/leaves/{id}` | `?email=` | Cancel your own leave request. |

Salesforce External Services generates `logTimesheet`, `listTimesheets`,
`deleteTimesheet`, `applyLeave`, `listLeaves`, and `cancelLeave` actions from
`/api/openapi`.

---

## Salesforce External Service

The OpenAPI 3.0 spec is served at **`/api/openapi`** (its `servers[0].url` is
filled in from the request host, or from `APP_BASE_URL` if set).

To register ([docs](https://help.salesforce.com/s/articleView?id=platform.external_services.htm&type=5)):

1. **Setup → Named Credential** pointing at your deployed base URL
   (e.g. `https://YOUR-APP.up.railway.app`).
2. **Setup → External Services → New** → *From API Specification*.
3. Choose the Named Credential and paste the spec from `/api/openapi`
   (or its URL). Salesforce generates invocable actions
   `logTimesheet`, `listTimesheets`, `deleteTimesheet` — usable in Flow / Apex.

> Tip: set `APP_BASE_URL` to your Railway URL so the spec's server URL is stable.

---

## ITSM Hardware Agent (POC)

A Slack Agentforce agent that remotely operates a physical Epson ET‑2800. The
cloud can't reach a LAN printer, so a **local connector** bridges them via a
command queue:

```
Slack → Hardware agent → runPrinterCommand (token-gated External Service)
   → /api/device/commands (enqueue + long-poll) → device_commands queue
   → local connector (printer-connector/) polls, runs on the printer, posts result
```

Commands: `status`, `identify`, `print_test`, `print_text`, `print_file`,
`scan`, `clear_queue`, `restart` (stub). Device endpoints are gated by
`DEVICE_API_TOKEN`; the OpenAPI spec is at `/api/device/openapi`. Full details in
[OVERVIEW.md](OVERVIEW.md) and [printer-connector/README.md](../printer-connector/README.md).

---

## Deploy (Railway)

`railway.toml` builds with Nixpacks and runs `npm start` (binds to `$PORT`).
In the Railway project's **Variables**, set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL` (your Railway URL, optional but recommended)

Push to `main` and Railway redeploys.

---

## Database schema

```sql
create table public.timesheet_entries (
  id          uuid primary key default gen_random_uuid(),
  user_email  text not null,
  week_start  date not null,            -- Monday of the week
  work_date   date,                     -- the specific day worked
  description text not null,
  hours       numeric(5,2) not null check (hours >= 0 and hours <= 168),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.timesheet_entries enable row level security; -- service-role only

create table public.leave_requests (
  id          uuid primary key default gen_random_uuid(),
  user_email  text not null,
  start_date  date not null,
  end_date    date not null,
  leave_type  text not null default 'vacation', -- vacation | sick | personal | other
  reason      text,
  status      text not null default 'pending',  -- pending | approved | rejected | cancelled
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.leave_requests enable row level security; -- service-role only
```
