/**
 * POST /api/device/commands/[id]/result — the connector reports a command's
 * outcome here, which unblocks the waiting POST /api/device/commands call.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deviceAuthorized } from "@/lib/deviceAuth";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!deviceAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const status = body.status === "error" ? "error" : "done";
    const { error } = await db()
      .from("device_commands")
      .update({ status, result: body.result ?? null })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
