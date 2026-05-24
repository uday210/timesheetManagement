/**
 * /api/timesheets/[id] — delete a single entry (DELETE).
 * Requires ?email so a caller can only delete their own rows.
 */
import { NextResponse } from "next/server";
import { deleteEntry } from "@/lib/timesheet";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "Missing ?email" }, { status: 400 });
    }

    const removed = await deleteEntry(id, email);
    if (!removed) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
