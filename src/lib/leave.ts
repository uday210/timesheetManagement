/**
 * leave.ts — the one place that reads/writes leave requests.
 *
 * Shared by the REST API routes, the MCP endpoint, and (via OpenAPI) Salesforce,
 * so identity and validation stay identical everywhere. Users are identified by
 * email, same as timesheets.
 */
import { db } from "./db";
import { toISODate } from "./week";
import { normalizeEmail } from "./timesheet";

export const LEAVE_TYPES = ["vacation", "sick", "personal", "other"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export interface LeaveRequest {
  id: string;
  user_email: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  leave_type: LeaveType;
  reason: string | null;
  status: LeaveStatus;
  days: number; // derived, inclusive
  created_at: string;
  updated_at: string;
}

const TABLE = "leave_requests";

function normalizeType(t: unknown): LeaveType {
  const v = String(t ?? "vacation").trim().toLowerCase();
  if (!(LEAVE_TYPES as readonly string[]).includes(v)) {
    throw new Error(`Leave type must be one of: ${LEAVE_TYPES.join(", ")}.`);
  }
  return v as LeaveType;
}

/** Inclusive day count between two ISO dates. */
function dayCount(start: string, end: string): number {
  const a = new Date(start + "T00:00:00Z").getTime();
  const b = new Date(end + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000) + 1;
}

function withDays(row: Omit<LeaveRequest, "days">): LeaveRequest {
  return { ...row, days: dayCount(row.start_date, row.end_date) };
}

export interface ApplyLeaveInput {
  email: unknown;
  start_date: unknown;
  end_date?: unknown; // defaults to start_date (single day) when omitted
  leave_type?: unknown;
  reason?: unknown;
}

/** Apply for leave. Returns the created request (status "pending"). */
export async function applyLeave(input: ApplyLeaveInput): Promise<LeaveRequest> {
  const user_email = normalizeEmail(input.email);
  const start_date = toISODate(input.start_date);
  const end_date = input.end_date ? toISODate(input.end_date) : start_date;
  if (end_date < start_date) {
    throw new Error("end_date cannot be before start_date.");
  }
  const leave_type = normalizeType(input.leave_type);
  const reason = input.reason != null ? String(input.reason).trim() || null : null;

  const { data, error } = await db()
    .from(TABLE)
    .insert({ user_email, start_date, end_date, leave_type, reason, status: "pending" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return withDays(data as Omit<LeaveRequest, "days">);
}

/** List a user's leave requests, soonest start first. */
export async function listLeaves(email: unknown): Promise<LeaveRequest[]> {
  const user_email = normalizeEmail(email);
  const { data, error } = await db()
    .from(TABLE)
    .select("*")
    .eq("user_email", user_email)
    .order("start_date", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => withDays(r as Omit<LeaveRequest, "days">));
}

/** Cancel (delete) a leave request, but only if it belongs to this email. */
export async function cancelLeave(id: string, email: unknown): Promise<boolean> {
  const user_email = normalizeEmail(email);
  const { data, error } = await db()
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("user_email", user_email)
    .select("id");

  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
