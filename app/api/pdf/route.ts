import { NextRequest, NextResponse } from "next/server";
import { verifyDownloadToken } from "@/lib/token";
import { SessionPDF } from "@/lib/pdf-template";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import React from "react";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  let session;
  try {
    ({ session } = await verifyDownloadToken(token));
  } catch {
    return new NextResponse(
      "Link abgelaufen oder ungültig. Bitte neues PDF in Airtable generieren.",
      { status: 410 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const logoUrl = `${appUrl}/logo.png`;

  let pdfArrayBuffer: ArrayBuffer;
  try {
    const buf = await renderToBuffer(
      React.createElement(SessionPDF, {
        session,
        logoUrl,
      }) as React.ReactElement<DocumentProps>
    );
    pdfArrayBuffer = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength
    ) as ArrayBuffer;
  } catch (err) {
    console.error("PDF generation error:", err);
    return new NextResponse("PDF-Generierung fehlgeschlagen", { status: 500 });
  }

  const playerSlug = session.spielerName.replace(/\s+/g, "-");
  const dateSlug = session.datum.replace(/\//g, "-");
  const filename = `FL-Session-${playerSlug}-${dateSlug}.pdf`;

  return new NextResponse(pdfArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
