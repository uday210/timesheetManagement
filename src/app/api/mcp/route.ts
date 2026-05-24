/**
 * /api/mcp — Model Context Protocol server (stateless Streamable HTTP).
 *
 * Hand-rolled JSON-RPC so it lives cleanly inside a Next.js App Router route
 * (the SDK's transport wants Node req/res, which route handlers don't expose).
 *
 * Tools:
 *   - log_timesheet   { email, hours, description, week? }
 *   - list_timesheets { email, week? }
 *
 * The user is always identified by the `email` argument — there is no session.
 */
import {
  createEntry,
  listEntries,
  groupByWeek,
  type WeekGroup,
} from "@/lib/timesheet";
import { applyLeave, listLeaves, LEAVE_TYPES } from "@/lib/leave";
import { weekLabel } from "@/lib/week";

export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "timesheet-portal", version: "1.0.0" };

// ── Tool catalog ──────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "log_timesheet",
    description:
      "Log hours worked for a user against a week. Identify the user by their email. " +
      "Week accepts a date (any day in the week, e.g. 2026-05-21) or 'this'/'last'/'next'; " +
      "defaults to the current week when omitted.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "The user's email address (their identity)." },
        hours: { type: "number", description: "Hours worked (0–168)." },
        description: { type: "string", description: "What the work was." },
        date: {
          type: "string",
          description: "The specific day worked (YYYY-MM-DD). Preferred. Optional.",
        },
        week: {
          type: "string",
          description:
            "Used only if `date` is omitted: a date like 2026-05-21, or 'this'/'last'/'next'.",
        },
      },
      required: ["email", "hours", "description"],
    },
  },
  {
    name: "list_timesheets",
    description:
      "List a user's logged timesheet entries grouped by week with totals. " +
      "Identify the user by email. Optionally filter to one week.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "The user's email address (their identity)." },
        week: {
          type: "string",
          description: "Optional week filter: a date like 2026-05-21, or 'this'/'last'/'next'.",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "apply_leave",
    description:
      "Apply for leave for a user (identified by email). Provide a start date and " +
      "optionally an end date (defaults to a single day). Status starts as 'pending'.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "The user's email address (their identity)." },
        start_date: { type: "string", description: "First day of leave (YYYY-MM-DD)." },
        end_date: {
          type: "string",
          description: "Last day of leave (YYYY-MM-DD). Optional; defaults to start_date.",
        },
        leave_type: {
          type: "string",
          enum: [...LEAVE_TYPES],
          description: "Type of leave. Defaults to 'vacation'.",
        },
        reason: { type: "string", description: "Optional reason / note." },
      },
      required: ["email", "start_date"],
    },
  },
  {
    name: "list_leaves",
    description: "List a user's leave requests (identified by email) with status and day counts.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "The user's email address (their identity)." },
      },
      required: ["email"],
    },
  },
] as const;

// ── JSON-RPC plumbing ─────────────────────────────────────────────────────────
type Id = string | number | null;
type Rpc = { jsonrpc: "2.0"; id?: Id; method: string; params?: Record<string, unknown> };

const result = (id: Id, r: unknown) => ({ jsonrpc: "2.0" as const, id, result: r });
const error = (id: Id, code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  id,
  error: { code, message },
});

function summarizeWeeks(weeks: WeekGroup[]): string {
  if (weeks.length === 0) return "No timesheet entries found.";
  const lines: string[] = [];
  let grand = 0;
  for (const w of weeks) {
    grand += w.total_hours;
    lines.push(`\n${w.week_label} — ${w.total_hours}h`);
    for (const e of w.entries) lines.push(`  • ${e.hours}h — ${e.description}`);
  }
  lines.push(`\nTotal: ${Math.round(grand * 100) / 100}h across ${weeks.length} week(s).`);
  return lines.join("\n").trim();
}

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "log_timesheet": {
      const entry = await createEntry({
        email: args.email,
        hours: args.hours,
        description: args.description,
        date: args.date as string | undefined,
        week: args.week as string | undefined,
      });
      const text =
        `Logged ${entry.hours}h for ${entry.user_email} on ${entry.work_date} ` +
        `(week of ${weekLabel(entry.week_start)}): "${entry.description}".`;
      return { content: [{ type: "text", text }], structuredContent: entry };
    }
    case "list_timesheets": {
      const entries = await listEntries(args.email, args.week as string | undefined);
      const weeks = groupByWeek(entries);
      return {
        content: [{ type: "text", text: summarizeWeeks(weeks) }],
        structuredContent: { weeks },
      };
    }
    case "apply_leave": {
      const leave = await applyLeave({
        email: args.email,
        start_date: args.start_date,
        end_date: args.end_date,
        leave_type: args.leave_type,
        reason: args.reason,
      });
      const span =
        leave.start_date === leave.end_date
          ? leave.start_date
          : `${leave.start_date} → ${leave.end_date}`;
      const text =
        `Leave request submitted for ${leave.user_email}: ${leave.leave_type}, ` +
        `${span} (${leave.days} day${leave.days === 1 ? "" : "s"}) — status ${leave.status}.`;
      return { content: [{ type: "text", text }], structuredContent: leave };
    }
    case "list_leaves": {
      const leaves = await listLeaves(args.email);
      const text =
        leaves.length === 0
          ? "No leave requests found."
          : leaves
              .map((l) => {
                const span =
                  l.start_date === l.end_date
                    ? l.start_date
                    : `${l.start_date} → ${l.end_date}`;
                return `• ${l.leave_type} — ${span} (${l.days}d) — ${l.status}${l.reason ? ` — ${l.reason}` : ""}`;
              })
              .join("\n");
      return { content: [{ type: "text", text }], structuredContent: { leaves } };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRpc(req: Rpc) {
  const id = req.id ?? null;

  switch (req.method) {
    case "initialize":
      return result(id, {
        protocolVersion:
          (req.params?.protocolVersion as string | undefined) ?? PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });

    case "tools/list":
      return result(id, { tools: TOOLS });

    case "tools/call": {
      const name = req.params?.name as string;
      const args = (req.params?.arguments as Record<string, unknown>) ?? {};
      try {
        return result(id, await callTool(name, args));
      } catch (err) {
        // Tool-level failures are reported as a result with isError, per MCP.
        return result(id, {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        });
      }
    }

    case "ping":
      return result(id, {});

    default:
      return error(id, -32601, `Method not found: ${req.method}`);
  }
}

// ── HTTP surface ──────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
};

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(error(null, -32700, "Parse error"), { status: 400, headers: CORS });
  }

  const batch = Array.isArray(payload) ? (payload as Rpc[]) : [payload as Rpc];
  const responses = [];
  for (const msg of batch) {
    // Notifications (e.g. notifications/initialized) have no id → no response.
    if (msg && msg.id === undefined) continue;
    responses.push(await handleRpc(msg));
  }

  // Nothing to answer (pure notifications) → 202 Accepted.
  if (responses.length === 0) return new Response(null, { status: 202, headers: CORS });

  const body = Array.isArray(payload) ? responses : responses[0];
  return Response.json(body, { headers: CORS });
}

// This stateless server doesn't push server-initiated events.
export async function GET() {
  return new Response("MCP endpoint. POST JSON-RPC here.", { status: 405, headers: CORS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
