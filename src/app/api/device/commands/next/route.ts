/**
 * GET /api/device/commands/next?device=… — the local connector polls this to
 * claim the oldest pending command for its device. Returns { command: null }
 * when there's nothing to do.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deviceAuthorized } from "@/lib/deviceAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!deviceAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const device = searchParams.get("device") || "printer-et2800";

  const { data: pending } = await db()
    .from("device_commands")
    .select("*")
    .eq("device", device)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  const cmd = pending?.[0];
  if (!cmd) return NextResponse.json({ command: null });

  // claim it
  await db()
    .from("device_commands")
    .update({ status: "in_progress" })
    .eq("id", cmd.id)
    .eq("status", "pending");

  return NextResponse.json({
    id: cmd.id,
    device: cmd.device,
    command: cmd.command,
    params: cmd.params,
  });
}
