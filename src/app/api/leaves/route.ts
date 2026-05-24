/**
 * /api/leaves — list (GET) and apply for (POST) leave requests.
 * Identity is the `email` the client sends; there is no session.
 */
import { NextResponse } from "next/server";
import { applyLeave, listLeaves } from "@/lib/leave";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "Missing ?email" }, { status: 400 });
    }
    const leaves = await listLeaves(email);
    return NextResponse.json({ leaves });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const leave = await applyLeave({
      email: body.email,
      start_date: body.start_date,
      end_date: body.end_date,
      leave_type: body.leave_type,
      reason: body.reason,
    });
    return NextResponse.json({ leave }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
