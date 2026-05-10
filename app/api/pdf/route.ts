import { NextRequest, NextResponse } from 'next/server';
import { verifyDownloadToken } from '@/lib/token';
import { fetchSession, consumeJti } from '@/lib/airtable';
import { generatePdfBuffer, type AttachmentImage } from '@/lib/pdf-template';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

const SECURITY_HEADERS = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

function errorResponse(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: { ...SECURITY_HEADERS, 'Cache-Control': 'no-store' },
  });
}

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[^A-Za-z0-9äöüÄÖÜß_-]/g, '_').slice(0, 80) || 'session';
}

const ALLOWED_ATTACHMENT_HOSTS = [
  /^dl\.airtable\.com$/,
  /\.airtableusercontent\.com$/,
];

function isAllowedAttachmentUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_ATTACHMENT_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return errorResponse('Missing token', 400);
  }

  let recordId: string;
  let jti: string;
  try {
    ({ recordId, jti } = await verifyDownloadToken(token));
  } catch {
    return errorResponse(
      'Link abgelaufen oder ungültig. Bitte neues PDF in Airtable generieren.',
      410
    );
  }

  let consumed = false;
  try {
    consumed = await consumeJti(recordId, jti);
  } catch (err) {
    console.error('Airtable consume JTI error:', err);
    return errorResponse('Internal error', 500);
  }
  if (!consumed) {
    return errorResponse(
      'Link wurde bereits verwendet oder ist nicht mehr gültig. Bitte neues PDF in Airtable generieren.',
      410
    );
  }

  let session;
  try {
    session = await fetchSession(recordId);
  } catch (err) {
    console.error('Airtable fetch error:', err);
    return errorResponse('Session nicht gefunden', 404);
  }

  const logoPath = path.join(process.cwd(), 'public', 'logo.png');
  const logoDataUrl = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;

  const shouldFetchImages =
    session.exportSelection.length === 0 || session.exportSelection.includes('Anhänge');

  const attachmentImages: AttachmentImage[] = shouldFetchImages && session.anhänge?.length
    ? (await Promise.all(
        session.anhänge
          .filter((att) => att.type.startsWith('image/') && isAllowedAttachmentUrl(att.url))
          .map(async (att) => {
            try {
              const res = await fetch(att.url);
              if (!res.ok) return null;
              const buf = Buffer.from(await res.arrayBuffer());
              return { dataUrl: `data:${att.type};base64,${buf.toString('base64')}`, filename: att.filename };
            } catch {
              return null;
            }
          })
      )).filter((r): r is AttachmentImage => r !== null)
    : [];

  let pdfArrayBuffer: ArrayBuffer;
  try {
    const buf = await generatePdfBuffer(session, logoDataUrl, attachmentImages);
    pdfArrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch (err) {
    console.error('PDF generation error:', err instanceof Error ? err.stack : err);
    return errorResponse('PDF-Generierung fehlgeschlagen', 500);
  }

  const playerSlug = sanitizeFilenamePart(session.spielerName.replace(/\s+/g, '-'));
  const dateSlug = sanitizeFilenamePart(session.datum.replace(/\//g, '-'));
  const filename = `FL-Session-${playerSlug}-${dateSlug}.pdf`;

  return new NextResponse(pdfArrayBuffer, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
