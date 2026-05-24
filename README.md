# Timesheet Portal

A simple portal for logging weekly hours. Users are identified by **email** — no
passwords. The same data is reachable three ways:

- **Web UI** — `/`
- **MCP server** — `/api/mcp` (for Claude / any MCP client)
- **REST API + OpenAPI** — `/api/timesheets`, described at `/api/openapi`
  (ready to register as a Salesforce **External Service**)

Built with Next.js 16 (App Router) + Supabase (Postgres).

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

The `timesheet_entries` table already exists (migration `create_timesheet_entries`).
To recreate it elsewhere, see [Database schema](#database-schema) below.

---

## Web UI

Enter your email once (stored in `localStorage`), then log hours with a week,
description, and hours value. Entries are grouped by week with running totals.
Use **switch user** to change email.

---

## MCP

Endpoint: `POST /api/mcp` (stateless Streamable HTTP JSON-RPC).

Tools:

| Tool | Arguments | What it does |
| --- | --- | --- |
| `log_timesheet` | `email`*, `hours`*, `description`*, `week?` | Logs hours for a week. |
| `list_timesheets` | `email`*, `week?` | Lists entries grouped by week with totals. |

`week` accepts a date (`2026-05-21`, any day in the week) or `this`/`last`/`next`;
it defaults to the current week. The user is always identified by `email`.

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
| `POST` | `/api/timesheets` | `{ email, hours, description, week? }` | Log an entry. |
| `DELETE` | `/api/timesheets/{id}` | `?email=` | Delete your own entry. |

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
  description text not null,
  hours       numeric(5,2) not null check (hours >= 0 and hours <= 168),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.timesheet_entries enable row level security; -- service-role only
```
