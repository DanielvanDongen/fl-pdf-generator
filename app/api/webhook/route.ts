import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { signDownloadToken, generateJti } from "@/lib/token";
import { fetchSession, appendJtiAndWriteUrl } from "@/lib/airtable";

export const runtime = "nodejs";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: NextRequest) {
  const provided = req.headers.get("x-webhook-secret") ?? "";
  const expected = process.env.WEBHOOK_SECRET ?? "";
  if (!expected || !safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let recordId: string;
  try {
    const body = await req.json();
    recordId = body.recordId;
    if (!recordId || typeof recordId !== "string" || !/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
      return NextResponse.json({ error: "Invalid recordId" }, { status: 400 });
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

  const jti = generateJti();
  const token = await signDownloadToken(recordId, jti);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const downloadUrl = `${appUrl}/api/pdf?token=${token}`;

  try {
    await appendJtiAndWriteUrl(recordId, downloadUrl, jti);
  } catch (err) {
    console.error("Airtable write error:", err);
    return NextResponse.json(
      { error: "Failed to write download URL to Airtable" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, downloadUrl });
}
