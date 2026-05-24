"use client";

import { useCallback, useEffect, useState } from "react";

interface Entry {
  id: string;
  week_start: string;
  work_date: string;
  description: string;
  hours: number;
}
interface WeekGroup {
  week_start: string;
  week_label: string;
  total_hours: number;
  entries: Entry[];
}
interface Leave {
  id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string | null;
  status: string;
  days: number;
}

const EMAIL_KEY = "timesheet.email";
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEAVE_TYPES = ["vacation", "sick", "personal", "other"];

// ── date helpers (UTC, matching the server) ──────────────────────────────────
function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  x.setUTCDate(x.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return x.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayNum(iso: string): number {
  return new Date(iso + "T00:00:00Z").getUTCDate();
}
function weekLabel(monday: string): string {
  const s = new Date(monday + "T00:00:00Z");
  const e = new Date(addDays(monday, 6) + "T00:00:00Z");
  const m1 = s.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const m2 = e.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const y = e.getUTCFullYear();
  return m1 === m2
    ? `${m1} ${s.getUTCDate()}–${e.getUTCDate()}, ${y}`
    : `${m1} ${s.getUTCDate()} – ${m2} ${e.getUTCDate()}, ${y}`;
}

export default function Home() {
  const [email, setEmail] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [tab, setTab] = useState<"timesheet" | "leave">("timesheet");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_KEY);
    if (saved) setEmail(saved);
  }, []);

  function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    const v = emailDraft.trim().toLowerCase();
    if (!v) return;
    localStorage.setItem(EMAIL_KEY, v);
    setEmail(v);
  }
  function signOut() {
    localStorage.removeItem(EMAIL_KEY);
    setEmail("");
    setEmailDraft("");
  }

  if (!email) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <h1 className="text-2xl font-semibold">Timesheet Portal</h1>
        <p className="mt-2 text-sm text-gray-500">
          Enter your email to log hours and apply for leave.
        </p>
        <form onSubmit={saveEmail} className="mt-6 flex gap-2">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
          />
          <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
            Continue
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Timesheet Portal</h1>
        <div className="text-right text-sm">
          <div className="text-gray-700">{email}</div>
          <button onClick={signOut} className="text-gray-400 hover:text-gray-700">
            switch user
          </button>
        </div>
      </header>

      <nav className="mt-6 flex gap-1 border-b border-gray-200">
        {(["timesheet", "leave"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setError("");
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${
              tab === t
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {tab === "timesheet" ? (
        <TimesheetTab email={email} onError={setError} />
      ) : (
        <LeaveTab email={email} onError={setError} />
      )}
    </main>
  );
}

// ── Timesheet tab ─────────────────────────────────────────────────────────────
function TimesheetTab({
  email,
  onError,
}: {
  email: string;
  onError: (m: string) => void;
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { hours: string; description: string }>>({});
  const [showAll, setShowAll] = useState(false);
  const [allWeeks, setAllWeeks] = useState<WeekGroup[]>([]);

  const loadWeek = useCallback(
    async (ws: string) => {
      onError("");
      try {
        const r = await fetch(`/api/timesheets?email=${encodeURIComponent(email)}&week=${ws}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load");
        const grp = (d.weeks as WeekGroup[]).find((w) => w.week_start === ws);
        setEntries(grp ? grp.entries : []);
      } catch (e) {
        onError((e as Error).message);
      }
    },
    [email, onError],
  );

  const loadAll = useCallback(async () => {
    onError("");
    try {
      const r = await fetch(`/api/timesheets?email=${encodeURIComponent(email)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load");
      setAllWeeks(d.weeks);
    } catch (e) {
      onError((e as Error).message);
    }
  }, [email, onError]);

  const loadLeaves = useCallback(async () => {
    try {
      const r = await fetch(`/api/leaves?email=${encodeURIComponent(email)}`);
      const d = await r.json();
      if (r.ok) setLeaves((d.leaves as Leave[]).filter((l) => l.status !== "rejected"));
    } catch {
      /* leave info is best-effort; the server still blocks on save */
    }
  }, [email]);

  useEffect(() => {
    loadWeek(weekStart);
  }, [weekStart, loadWeek]);
  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);
  useEffect(() => {
    if (showAll) loadAll();
  }, [showAll, loadAll]);

  const leaveOn = (date: string) =>
    leaves.find((l) => l.start_date <= date && date <= l.end_date);

  async function addForDay(date: string) {
    const draft = drafts[date] || { hours: "", description: "" };
    if (!draft.hours || !draft.description) {
      onError("Enter both hours and a description for that day.");
      return;
    }
    onError("");
    try {
      const r = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, date, hours: draft.hours, description: draft.description }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to save");
      setDrafts((p) => ({ ...p, [date]: { hours: "", description: "" } }));
      await loadWeek(weekStart);
      if (showAll) await loadAll();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function remove(id: string) {
    onError("");
    try {
      const r = await fetch(`/api/timesheets/${id}?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed to delete");
      await loadWeek(weekStart);
      if (showAll) await loadAll();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  const days = DAY_NAMES.map((name, i) => {
    const date = addDays(weekStart, i);
    return {
      name,
      date,
      entries: entries.filter((e) => e.work_date === date),
      leave: leaveOn(date),
    };
  });
  const weekTotal = entries.reduce((s, e) => s + Number(e.hours), 0);

  function setDraft(date: string, patch: Partial<{ hours: string; description: string }>) {
    setDrafts((p) => {
      const cur = p[date] ?? { hours: "", description: "" };
      return { ...p, [date]: { ...cur, ...patch } };
    });
  }

  return (
    <div className="mt-6">
      {/* week navigator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
          >
            ◀
          </button>
          <span className="min-w-[180px] text-center text-sm font-medium">
            {weekLabel(weekStart)}
          </span>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
          >
            ▶
          </button>
          <button
            onClick={() => setWeekStart(mondayOf(new Date()))}
            className="ml-1 text-sm text-gray-400 hover:text-gray-700"
          >
            This week
          </button>
        </div>
        <span className="text-sm text-gray-500">{Math.round(weekTotal * 100) / 100}h this week</span>
      </div>

      {/* 7-day row */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => (
          <div
            key={d.date}
            className={`flex min-w-[150px] flex-1 flex-col rounded-lg border p-2 ${
              d.leave ? "border-amber-200 bg-amber-50" : "border-gray-200"
            }`}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium">{d.name}</span>
              <span className="text-xs text-gray-400">{dayNum(d.date)}</span>
            </div>

            <ul className="mb-2 space-y-1">
              {d.entries.map((en) => (
                <li
                  key={en.id}
                  className="group rounded-md bg-gray-50 px-2 py-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium tabular-nums">{en.hours}h</span>
                    <button
                      onClick={() => remove(en.id)}
                      className="text-gray-300 hover:text-red-600"
                      aria-label="Delete entry"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="text-gray-600">{en.description}</div>
                </li>
              ))}
            </ul>

            {d.leave ? (
              <div className="mt-auto rounded-md border border-amber-200 bg-amber-100 px-2 py-2 text-center text-xs font-medium capitalize text-amber-800">
                On leave
                <div className="font-normal lowercase">{d.leave.leave_type}</div>
              </div>
            ) : (
              <div className="mt-auto space-y-1">
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="168"
                  placeholder="hrs"
                  value={drafts[d.date]?.hours ?? ""}
                  onChange={(e) => setDraft(d.date, { hours: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-gray-900"
                />
                <input
                  type="text"
                  placeholder="description"
                  value={drafts[d.date]?.description ?? ""}
                  onChange={(e) => setDraft(d.date, { description: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && addForDay(d.date)}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-gray-900"
                />
                <button
                  onClick={() => addForDay(d.date)}
                  className="w-full rounded bg-gray-900 py-1 text-xs font-medium text-white hover:bg-gray-700"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* view all */}
      <button
        onClick={() => setShowAll((s) => !s)}
        className="mt-6 text-sm font-medium text-gray-700 underline-offset-2 hover:underline"
      >
        {showAll ? "Hide all timesheets" : "View all timesheets"}
      </button>

      {showAll && (
        <div className="mt-4 space-y-6">
          {allWeeks.length === 0 ? (
            <p className="text-sm text-gray-400">No entries yet.</p>
          ) : (
            allWeeks.map((w) => (
              <section key={w.week_start}>
                <div className="flex items-baseline justify-between border-b border-gray-200 pb-1">
                  <h3 className="font-medium">{w.week_label}</h3>
                  <span className="text-sm font-medium text-gray-600">{w.total_hours}h</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {w.entries.map((en) => (
                    <li
                      key={en.id}
                      className="group flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm hover:bg-gray-50"
                    >
                      <span className="w-24 shrink-0 text-gray-400">{en.work_date}</span>
                      <span className="flex-1 text-gray-800">{en.description}</span>
                      <span className="tabular-nums text-gray-500">{en.hours}h</span>
                      <button
                        onClick={() => remove(en.id)}
                        className="text-gray-300 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                        aria-label="Delete entry"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Leave tab ─────────────────────────────────────────────────────────────────
function LeaveTab({ email, onError }: { email: string; onError: (m: string) => void }) {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState("vacation");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    onError("");
    try {
      const r = await fetch(`/api/leaves?email=${encodeURIComponent(email)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load");
      setLeaves(d.leaves);
    } catch (e) {
      onError((e as Error).message);
    }
  }, [email, onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      const r = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          start_date: start,
          end_date: end || start,
          leave_type: type,
          reason,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to apply");
      setStart("");
      setEnd("");
      setReason("");
      setType("vacation");
      await load();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    onError("");
    try {
      const r = await fetch(`/api/leaves/${id}?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed to cancel");
      await load();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  const statusColor: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="mt-6">
      <form onSubmit={apply} className="rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm font-medium">Apply for leave</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">From</span>
            <input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">To (optional)</span>
            <input
              type="date"
              value={end}
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 capitalize outline-none focus:border-gray-900"
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? "Submitting…" : "Apply"}
            </button>
          </div>
        </div>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-gray-500">Reason (optional)</span>
          <input
            type="text"
            placeholder="e.g. family trip"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
          />
        </label>
      </form>

      <h2 className="mt-8 text-lg font-medium">Your leave requests</h2>
      {leaves.length === 0 ? (
        <p className="mt-3 text-sm text-gray-400">No leave requests yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {leaves.map((l) => (
            <li key={l.id} className="group flex items-center gap-3 py-2 text-sm">
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${
                  statusColor[l.status] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {l.status}
              </span>
              <span className="w-20 capitalize text-gray-700">{l.leave_type}</span>
              <span className="flex-1 text-gray-800">
                {l.start_date === l.end_date
                  ? l.start_date
                  : `${l.start_date} → ${l.end_date}`}{" "}
                <span className="text-gray-400">
                  ({l.days} day{l.days === 1 ? "" : "s"})
                </span>
                {l.reason && <span className="text-gray-500"> — {l.reason}</span>}
              </span>
              <button
                onClick={() => cancel(l.id)}
                className="text-gray-300 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                aria-label="Cancel leave"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
