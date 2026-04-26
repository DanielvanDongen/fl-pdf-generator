import { NextRequest, NextResponse } from 'next/server';
import { verifyDownloadToken } from '@/lib/token';
import { fetchSession } from '@/lib/airtable';
import { generatePdfBuffer } from '@/lib/pdf-template';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return new NextResponse('Missing token', { status: 400 });
  }

  let recordId: string;
  try {
    ({ recordId } = await verifyDownloadToken(token));
  } catch {
    return new NextResponse(
      'Link abgelaufen oder ungültig. Bitte neues PDF in Airtable generieren.',
      { status: 410 }
    );
  }

  let session;
  try {
    session = await fetchSession(recordId);
  } catch (err) {
    console.error('Airtable fetch error:', err);
    return new NextResponse('Session nicht gefunden', { status: 404 });
  }

  const logoPath = path.join(process.cwd(), 'public', 'logo.png');
  const logoDataUrl = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;

  let pdfArrayBuffer: ArrayBuffer;
  try {
    const buf = await generatePdfBuffer(session, logoDataUrl);
    pdfArrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch (err) {
    console.error('PDF generation error:', err instanceof Error ? err.stack : err);
    return new NextResponse('PDF-Generierung fehlgeschlagen', { status: 500 });
  }

  const playerSlug = session.spielerName.replace(/\s+/g, '-');
  const dateSlug = session.datum.replace(/\//g, '-');
  const filename = `FL-Session-${playerSlug}-${dateSlug}.pdf`;

  return new NextResponse(pdfArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
