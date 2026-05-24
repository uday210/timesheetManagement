/**
 * POST /api/device/commands — enqueue a command for a device and wait for the
 * result (long-poll up to ~25s) so the caller (the Salesforce agent) gets the
 * outcome in a single call. The local connector picks up the command and posts
 * the result back via /api/device/commands/[id]/result.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deviceAuthorized } from "@/lib/deviceAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  if (!deviceAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const device = String(body.device || "printer-et2800");
    const command = String(body.command || "").trim();
    if (!command) return NextResponse.json({ error: "Missing command" }, { status: 400 });

    const params =
      body.params ?? { text: body.text ?? null, fileUrl: body.fileUrl ?? null };
    const { data: cmd, error } = await db()
      .from("device_commands")
      .insert({ device, command, params })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const deadline = Date.now() + 55000;
    while (Date.now() < deadline) {
      await sleep(1000);
      const { data } = await db()
        .from("device_commands")
        .select("status, result")
        .eq("id", cmd.id)
        .single();
      if (data && (data.status === "done" || data.status === "error")) {
        const r = data.result as unknown;
        const summary =
          r && typeof r === "object" && "summary" in r
            ? (r as { summary: string }).summary
            : typeof r === "string"
              ? r
              : "Done.";
        return NextResponse.json({ id: cmd.id, status: data.status, summary, result: r });
      }
    }
    const msg = "The device connector didn't respond in time — is it running and online?";
    return NextResponse.json({ id: cmd.id, status: "timeout", summary: msg, result: msg });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
