import { NextRequest, NextResponse } from "next/server";
import { signDownloadToken } from "@/lib/token";
import { writeDownloadUrl } from "@/lib/airtable";
import type { SessionRecord } from "@/lib/airtable";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const recordId = body.recordId as string;
  if (!recordId) {
    return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
  }

  // Parse exportSelection — Airtable sends multiselect as comma-separated string
  const exportRaw = body.exportSelection;
  const exportSelection: string[] =
    typeof exportRaw === "string"
      ? exportRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : Array.isArray(exportRaw)
      ? (exportRaw as string[])
      : [];

  const session: SessionRecord = {
    id: recordId,
    datum: (body.datum as string) ?? "",
    sessionTyp: (body.sessionTyp as string) ?? "",
    spielerName: (body.spielerName as string) ?? "–",
    coachName: (body.coachName as string) ?? "–",
    dauer: body.dauer ? Number(body.dauer) : null,
    medium: (body.medium as string) ?? null,
    notizen: (body.notizen as string) ?? null,
    toDos: (body.toDos as string) ?? null,
    routinen: (body.routinen as string) ?? null,
    affirmationen: (body.affirmationen as string) ?? null,
    exportSelection,
  };

  const token = await signDownloadToken(session);
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
