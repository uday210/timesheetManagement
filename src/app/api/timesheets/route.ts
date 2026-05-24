/**
 * /api/timesheets — list (GET) and log (POST) timesheet entries for the UI.
 * Identity is the `email` the client sends; there is no session.
 */
import { NextResponse } from "next/server";
import { createEntry, listEntries, groupByWeek } from "@/lib/timesheet";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const week = searchParams.get("week");
    if (!email) {
      return NextResponse.json({ error: "Missing ?email" }, { status: 400 });
    }

    const entries = await listEntries(email, week);
    const weeks = groupByWeek(entries);
    const total = weeks.reduce((sum, w) => sum + w.total_hours, 0);
    return NextResponse.json({ weeks, total_hours: Math.round(total * 100) / 100 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const entry = await createEntry({
      email: body.email,
      week: body.week,
      description: body.description,
      hours: body.hours,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
