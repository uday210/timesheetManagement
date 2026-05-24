/**
 * /api/openapi — OpenAPI 3.0 description of the timesheet REST API.
 *
 * Built for Salesforce External Services: every operation has an operationId,
 * schemas are named under components, and the `servers[0].url` is filled in from
 * the incoming request so the spec is correct wherever this is deployed.
 * Register in Salesforce via Setup → External Services, "From API Specification".
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function baseUrl(request: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const h = request.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  const spec = {
    openapi: "3.0.0",
    info: {
      title: "Timesheet Portal API",
      description:
        "Log and review weekly timesheet hours. Users are identified by email.",
      version: "1.0.0",
    },
    servers: [{ url: baseUrl(request) }],
    paths: {
      "/api/timesheets": {
        get: {
          operationId: "listTimesheets",
          summary: "List a user's timesheet entries grouped by week",
          parameters: [
            {
              name: "email",
              in: "query",
              required: true,
              description: "The user's email address (their identity).",
              schema: { type: "string" },
            },
            {
              name: "week",
              in: "query",
              required: false,
              description:
                "Optional week filter: a date (YYYY-MM-DD) or 'this'/'last'/'next'.",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Weekly summary",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TimesheetSummary" },
                },
              },
            },
          },
        },
        post: {
          operationId: "logTimesheet",
          summary: "Log hours for a user against a week",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LogTimesheetRequest" },
              },
            },
          },
          responses: {
            "201": {
              description: "Created entry",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CreatedEntry" },
                },
              },
            },
          },
        },
      },
      "/api/timesheets/{id}": {
        delete: {
          operationId: "deleteTimesheet",
          summary: "Delete one of the user's entries",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Entry id (UUID).",
              schema: { type: "string" },
            },
            {
              name: "email",
              in: "query",
              required: true,
              description: "The user's email; only their own entries can be deleted.",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Deleted",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DeleteResult" },
                },
              },
            },
          },
        },
      },
      "/api/leaves": {
        get: {
          operationId: "listLeaves",
          summary: "List a user's leave requests",
          parameters: [
            {
              name: "email",
              in: "query",
              required: true,
              description: "The user's email address (their identity).",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Leave requests",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LeaveList" },
                },
              },
            },
          },
        },
        post: {
          operationId: "applyLeave",
          summary: "Apply for leave",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApplyLeaveRequest" },
              },
            },
          },
          responses: {
            "201": {
              description: "Created leave request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CreatedLeave" },
                },
              },
            },
          },
        },
      },
      "/api/leaves/{id}": {
        delete: {
          operationId: "cancelLeave",
          summary: "Cancel one of the user's leave requests",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Leave request id (UUID).",
              schema: { type: "string" },
            },
            {
              name: "email",
              in: "query",
              required: true,
              description: "The user's email; only their own requests can be cancelled.",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Cancelled",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DeleteResult" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        LogTimesheetRequest: {
          type: "object",
          required: ["email", "hours", "description"],
          properties: {
            email: { type: "string", description: "User's email (identity)." },
            hours: { type: "number", description: "Hours worked (0–168)." },
            description: { type: "string", description: "What the work was." },
            work_date: {
              type: "string",
              description:
                "Specific day worked (YYYY-MM-DD). Preferred. Optional. " +
                "(Named work_date, not 'date', because 'date' is an Apex reserved word.)",
            },
            week: {
              type: "string",
              description:
                "Used only if work_date omitted: a date (YYYY-MM-DD) or 'this'/'last'/'next'.",
            },
          },
        },
        TimesheetEntry: {
          type: "object",
          properties: {
            id: { type: "string" },
            user_email: { type: "string" },
            week_start: { type: "string", description: "Monday of the week (YYYY-MM-DD)." },
            work_date: { type: "string", description: "The specific day worked (YYYY-MM-DD)." },
            description: { type: "string" },
            hours: { type: "number" },
            created_at: { type: "string" },
            updated_at: { type: "string" },
          },
        },
        CreatedEntry: {
          type: "object",
          properties: {
            entry: { $ref: "#/components/schemas/TimesheetEntry" },
          },
        },
        WeekGroup: {
          type: "object",
          properties: {
            week_start: { type: "string" },
            week_label: { type: "string" },
            total_hours: { type: "number" },
            entries: {
              type: "array",
              items: { $ref: "#/components/schemas/TimesheetEntry" },
            },
          },
        },
        TimesheetSummary: {
          type: "object",
          properties: {
            total_hours: { type: "number" },
            weeks: {
              type: "array",
              items: { $ref: "#/components/schemas/WeekGroup" },
            },
          },
        },
        DeleteResult: {
          type: "object",
          properties: { ok: { type: "boolean" } },
        },
        ApplyLeaveRequest: {
          type: "object",
          required: ["email", "start_date"],
          properties: {
            email: { type: "string", description: "User's email (identity)." },
            start_date: { type: "string", description: "First day of leave (YYYY-MM-DD)." },
            end_date: {
              type: "string",
              description: "Last day (YYYY-MM-DD). Optional; defaults to start_date.",
            },
            leave_type: {
              type: "string",
              enum: ["vacation", "sick", "personal", "other"],
              description: "Type of leave. Defaults to 'vacation'.",
            },
            reason: { type: "string", description: "Optional reason / note." },
          },
        },
        LeaveRequest: {
          type: "object",
          properties: {
            id: { type: "string" },
            user_email: { type: "string" },
            start_date: { type: "string" },
            end_date: { type: "string" },
            leave_type: { type: "string" },
            reason: { type: "string" },
            status: { type: "string", description: "pending | approved | rejected | cancelled" },
            days: { type: "integer", description: "Inclusive day count." },
            created_at: { type: "string" },
            updated_at: { type: "string" },
          },
        },
        CreatedLeave: {
          type: "object",
          properties: { leave: { $ref: "#/components/schemas/LeaveRequest" } },
        },
        LeaveList: {
          type: "object",
          properties: {
            leaves: {
              type: "array",
              items: { $ref: "#/components/schemas/LeaveRequest" },
            },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
