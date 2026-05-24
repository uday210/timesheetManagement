/**
 * week.ts — helpers for turning loose "week" input into a canonical week.
 *
 * A week is identified by the ISO date (YYYY-MM-DD) of its Monday. Both the UI
 * and the MCP server normalize whatever the caller gives us down to that Monday
 * so entries always group cleanly.
 */

/** Validate/normalize a date string to YYYY-MM-DD (UTC). Throws if unparseable. */
export function toISODate(input: unknown): string {
  const raw = String(input ?? "").trim();
  const d = new Date(raw);
  if (isNaN(d.getTime())) throw new Error(`Invalid date "${input}". Use YYYY-MM-DD.`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

/** Returns the YYYY-MM-DD of the Monday of the week containing `date` (UTC). */
export function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a free-form week reference to the Monday (YYYY-MM-DD) of that week.
 * Accepts:
 *   - undefined / "" / "this" / "current"  → current week
 *   - "last" / "previous" / "prev"         → last week
 *   - "next"                               → next week
 *   - any parseable date (e.g. "2026-05-21")→ the week containing that date
 * Throws if a non-empty string can't be understood.
 */
export function resolveWeek(input?: string | null): string {
  const now = new Date();
  if (input == null) return mondayOf(now);

  const raw = String(input).trim().toLowerCase();
  if (raw === "" || raw === "this" || raw === "current" || raw === "this week") {
    return mondayOf(now);
  }
  if (raw === "last" || raw === "previous" || raw === "prev" || raw === "last week") {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 7);
    return mondayOf(d);
  }
  if (raw === "next" || raw === "next week") {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 7);
    return mondayOf(d);
  }

  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) {
    throw new Error(
      `Could not understand week "${input}". Use a date like 2026-05-21, or "this"/"last"/"next".`,
    );
  }
  return mondayOf(parsed);
}

/** "May 18–24, 2026" style label for a Monday-of-week ISO date. */
export function weekLabel(mondayISO: string): string {
  const start = new Date(mondayISO + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const mon = start.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const monEnd = end.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const d1 = start.getUTCDate();
  const d2 = end.getUTCDate();
  const year = end.getUTCFullYear();

  return mon === monEnd
    ? `${mon} ${d1}–${d2}, ${year}`
    : `${mon} ${d1} – ${monEnd} ${d2}, ${year}`;
}
