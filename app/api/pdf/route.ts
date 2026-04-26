import { NextRequest, NextResponse } from "next/server";
import { verifyDownloadToken } from "@/lib/token";
import { fetchSession } from "@/lib/airtable";
import { SessionPDF } from "@/lib/pdf-template";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  // Validate JWT — throws if expired or invalid
  let recordId: string;
  try {
    ({ recordId } = await verifyDownloadToken(token));
  } catch {
    return new NextResponse(
      "Link abgelaufen oder ungültig. Bitte neues PDF in Airtable generieren.",
      { status: 410 }
    );
  }

  // Fetch fresh session data
  let session;
  try {
    session = await fetchSession(recordId);
  } catch (err) {
    console.error("Airtable fetch error:", err);
    return new NextResponse("Session nicht gefunden", { status: 404 });
  }

  // Logo URL — served from /public/logo.png
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const logoUrl = `${appUrl}/logo.png`;

  // Generate PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderToBuffer(
      React.createElement(SessionPDF, { session, logoUrl })
    );
  } catch (err) {
    console.error("PDF generation error:", err);
    return new NextResponse("PDF-Generierung fehlgeschlagen", { status: 500 });
  }

  const playerSlug = session.spielerName.replace(/\s+/g, "-");
  const dateSlug = session.datum.replace(/\//g, "-");
  const filename = `FL-Session-${playerSlug}-${dateSlug}.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
