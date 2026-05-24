/**
 * timesheet.ts — the one place that reads/writes timesheet entries.
 *
 * Shared by the REST API routes and the MCP endpoint so both behave identically:
 * same validation, same week normalization, same shape coming back out.
 */
import { db } from "./db";
import { resolveWeek, weekLabel, toISODate, mondayOf } from "./week";

export interface TimesheetEntry {
  id: string;
  user_email: string;
  week_start: string; // YYYY-MM-DD (Monday)
  work_date: string; // YYYY-MM-DD (the specific day worked)
  description: string;
  hours: number;
  created_at: string;
  updated_at: string;
}

export interface WeekGroup {
  week_start: string;
  week_label: string;
  total_hours: number;
  entries: TimesheetEntry[];
}

const TABLE = "timesheet_entries";

/** Normalize + validate an email. Throws on anything unusable. */
export function normalizeEmail(email: unknown): string {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    throw new Error(`"${email}" is not a valid email address.`);
  }
  return e;
}

/** Validate hours into a number in (0, 168]. Throws otherwise. */
export function normalizeHours(hours: unknown): number {
  const n = typeof hours === "number" ? hours : parseFloat(String(hours));
  if (!isFinite(n) || n <= 0 || n > 168) {
    throw new Error(`Hours must be a number between 0 and 168 (got "${hours}").`);
  }
  return Math.round(n * 100) / 100;
}

export interface CreateInput {
  email: unknown;
  hours: unknown;
  description: unknown;
  date?: string | null; // a specific day (YYYY-MM-DD) — preferred
  week?: string | null; // fallback: any day in the week, or this/last/next
}

/** Log a new timesheet entry. Returns the saved row. */
export async function createEntry(input: CreateInput): Promise<TimesheetEntry> {
  const user_email = normalizeEmail(input.email);
  const hours = normalizeHours(input.hours);
  const description = String(input.description ?? "").trim();
  if (!description) throw new Error("Description is required.");

  // Prefer an explicit day; otherwise fall back to a week reference (use its Monday).
  let work_date: string;
  let week_start: string;
  if (input.date) {
    work_date = toISODate(input.date);
    week_start = mondayOf(new Date(work_date + "T00:00:00Z"));
  } else {
    week_start = resolveWeek(input.week);
    work_date = week_start;
  }

  const { data, error } = await db()
    .from(TABLE)
    .insert({ user_email, week_start, work_date, description, hours })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as TimesheetEntry;
}

/** List a user's entries (optionally a single week), newest week first. */
export async function listEntries(
  email: unknown,
  week?: string | null,
): Promise<TimesheetEntry[]> {
  const user_email = normalizeEmail(email);

  let q = db()
    .from(TABLE)
    .select("*")
    .eq("user_email", user_email)
    .order("week_start", { ascending: false })
    .order("work_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (week) q = q.eq("week_start", resolveWeek(week));

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as TimesheetEntry[];
}

/** Group flat entries into weeks with per-week totals. */
export function groupByWeek(entries: TimesheetEntry[]): WeekGroup[] {
  const map = new Map<string, WeekGroup>();
  for (const e of entries) {
    let g = map.get(e.week_start);
    if (!g) {
      g = {
        week_start: e.week_start,
        week_label: weekLabel(e.week_start),
        total_hours: 0,
        entries: [],
      };
      map.set(e.week_start, g);
    }
    g.entries.push(e);
    g.total_hours = Math.round((g.total_hours + Number(e.hours)) * 100) / 100;
  }
  return [...map.values()].sort((a, b) => (a.week_start < b.week_start ? 1 : -1));
}

/** Delete one entry, but only if it belongs to this email. Returns true if removed. */
export async function deleteEntry(id: string, email: unknown): Promise<boolean> {
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
