/**
 * POST /api/device/scan-upload — the connector uploads a scanned image here;
 * we store it in the public "scans" Supabase Storage bucket and return a URL the
 * agent can post back to the user (Slack unfurls it).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deviceAuthorized } from "@/lib/deviceAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!deviceAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const contentType = body.contentType || "image/jpeg";
    const ext = contentType.includes("pdf") ? "pdf" : "jpg";
    const buffer = Buffer.from(String(body.dataBase64 || ""), "base64");
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Empty upload" }, { status: 400 });
    }

    const objectPath = `scan-${Date.now()}.${ext}`;
    const sb = db();
    const { error } = await sb.storage
      .from("scans")
      .upload(objectPath, buffer, { contentType, upsert: true });
    if (error) throw new Error(error.message);

    const { data } = sb.storage.from("scans").getPublicUrl(objectPath);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
