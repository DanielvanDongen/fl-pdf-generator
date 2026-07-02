import { NextRequest, NextResponse } from 'next/server';
import { verifyDownloadToken } from '@/lib/token';
import { fetchSession, consumeJti } from '@/lib/airtable';
import { generatePdfBuffer, type PdfAttachment } from '@/lib/pdf-template';
import { appendPdfAttachments, type PdfDocAttachment } from '@/lib/merge-pdf';
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

  const shouldFetchAttachments =
    session.exportSelection.length === 0 || session.exportSelection.includes('Anhänge');

  // Cap converted text so a huge file can't blow up the PDF.
  const MAX_TEXT_CHARS = 200_000;
  const isTextAttachment = (type: string, filename: string) =>
    type.startsWith('text/') || /\.(txt|md|markdown)$/i.test(filename);
  const isPdfAttachment = (type: string, filename: string) =>
    type === 'application/pdf' || /\.pdf$/i.test(filename);

  // Images + text docs go into the pdfmake template (rendered inline, in field
  // order). PDFs can't be embedded by pdfmake, so they're collected separately
  // and their pages are appended to the finished protocol via pdf-lib.
  type Fetched =
    | { channel: 'template'; value: PdfAttachment }
    | { channel: 'pdf'; value: PdfDocAttachment };

  const fetched: Fetched[] = shouldFetchAttachments && session.anhänge?.length
    ? (await Promise.all(
        session.anhänge
          .filter((att) => isAllowedAttachmentUrl(att.url))
          .map(async (att): Promise<Fetched | null> => {
            const isImage = att.type.startsWith('image/');
            const isText = !isImage && isTextAttachment(att.type, att.filename);
            const isPdf = !isImage && !isText && isPdfAttachment(att.type, att.filename);
            if (!isImage && !isText && !isPdf) return null; // skip other binaries
            try {
              const res = await fetch(att.url);
              if (!res.ok) return null;
              const buf = Buffer.from(await res.arrayBuffer());
              if (isImage) {
                return {
                  channel: 'template',
                  value: {
                    kind: 'image',
                    dataUrl: `data:${att.type};base64,${buf.toString('base64')}`,
                    filename: att.filename,
                  },
                };
              }
              if (isPdf) {
                return { channel: 'pdf', value: { bytes: buf, filename: att.filename } };
              }
              const full = buf.toString('utf-8');
              const text =
                full.length > MAX_TEXT_CHARS ? full.slice(0, MAX_TEXT_CHARS) + '\n…' : full;
              return { channel: 'template', value: { kind: 'text', text, filename: att.filename } };
            } catch {
              return null;
            }
          })
      )).filter((r): r is Fetched => r !== null)
    : [];

  const attachments: PdfAttachment[] = fetched
    .filter((f): f is Extract<Fetched, { channel: 'template' }> => f.channel === 'template')
    .map((f) => f.value);
  const pdfAttachments: PdfDocAttachment[] = fetched
    .filter((f): f is Extract<Fetched, { channel: 'pdf' }> => f.channel === 'pdf')
    .map((f) => f.value);

  let pdfArrayBuffer: ArrayBuffer;
  try {
    let buf = await generatePdfBuffer(session, logoDataUrl, attachments);
    buf = await appendPdfAttachments(buf, pdfAttachments);
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
