/**
 * /api/leaves/[id] — cancel (delete) a leave request (DELETE).
 * Requires ?email so a caller can only cancel their own requests.
 */
import { NextResponse } from "next/server";
import { cancelLeave } from "@/lib/leave";

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
    const cancelled = await cancelLeave(id, email);
    if (!cancelled) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
