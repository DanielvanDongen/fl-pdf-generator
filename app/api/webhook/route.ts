import { NextRequest, NextResponse } from "next/server";
import { signDownloadToken } from "@/lib/token";
import { fetchSession, writeDownloadUrl } from "@/lib/airtable";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let recordId: string;
  try {
    const body = await req.json();
    recordId = body.recordId;
    if (!recordId || typeof recordId !== "string") {
      return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await fetchSession(recordId);
  } catch (err) {
    console.error("Airtable fetch error:", err);
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const token = await signDownloadToken(recordId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const downloadUrl = `${appUrl}/api/pdf?token=${token}`;

  try {
    await writeDownloadUrl(recordId, downloadUrl);
  } catch (err) {
    console.error("Airtable write error:", err);
    return NextResponse.json(
      { error: "Failed to write download URL to Airtable" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, downloadUrl });
}
