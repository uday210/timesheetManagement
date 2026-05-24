"use client";

import { useCallback, useEffect, useState } from "react";

interface Entry {
  id: string;
  week_start: string;
  description: string;
  hours: number;
}
interface WeekGroup {
  week_start: string;
  week_label: string;
  total_hours: number;
  entries: Entry[];
}

const EMAIL_KEY = "timesheet.email";
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Home() {
  const [email, setEmail] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // form state
  const [week, setWeek] = useState(todayISO());
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Restore saved email on first load.
  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_KEY);
    if (saved) setEmail(saved);
  }, []);

  const load = useCallback(async (who: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/timesheets?email=${encodeURIComponent(who)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setWeeks(data.weeks);
      setTotal(data.total_hours);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (email) load(email);
  }, [email, load]);

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
    setWeeks([]);
    setTotal(0);
  }

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, week, hours, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setHours("");
      setDescription("");
      await load(email);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      const res = await fetch(
        `/api/timesheets/${id}?email=${encodeURIComponent(email)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      await load(email);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ── Email gate ──────────────────────────────────────────────────────────────
  if (!email) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <h1 className="text-2xl font-semibold">Timesheet Portal</h1>
        <p className="mt-2 text-sm text-gray-500">
          Enter your email to view and log your hours.
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
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Continue
          </button>
        </form>
      </main>
    );
  }

  // ── Main app ────────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Timesheet Portal</h1>
        <div className="text-right text-sm">
          <div className="text-gray-700">{email}</div>
          <button onClick={signOut} className="text-gray-400 hover:text-gray-700">
            switch user
          </button>
        </div>
      </header>

      {/* Add entry */}
      <form onSubmit={addEntry} className="mt-8 rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Week (any day)</span>
            <input
              type="date"
              required
              value={week}
              onChange={(e) => setWeek(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Hours</span>
            <input
              type="number"
              required
              step="0.25"
              min="0"
              max="168"
              placeholder="8"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Log hours"}
            </button>
          </div>
        </div>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-gray-500">Description</span>
          <input
            type="text"
            required
            placeholder="What did you work on?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
          />
        </label>
      </form>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Summary */}
      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="text-lg font-medium">Your hours</h2>
        <span className="text-sm text-gray-500">{total}h logged total</span>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading…</p>
      ) : weeks.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No entries yet. Log your first above.</p>
      ) : (
        <div className="mt-4 space-y-6">
          {weeks.map((w) => (
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
          ))}
        </div>
      )}

      <footer className="mt-12 border-t border-gray-200 pt-4 text-xs text-gray-400">
        Also available via MCP at <code>/api/mcp</code> and as a Salesforce External
        Service via <code>/api/openapi</code>.
      </footer>
    </main>
  );
}
