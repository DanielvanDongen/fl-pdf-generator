import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// FL brand colors (mirrors pdf-template.ts).
const FL_GREEN = rgb(0, 0.757, 0.212); // #00C136
const DARK = rgb(0.102, 0.102, 0.102); // #1A1A1A
const GRAY = rgb(0.42, 0.451, 0.502); // #6B7280

// A4 in points.
const A4: [number, number] = [595.28, 841.89];

export interface PdfDocAttachment {
  bytes: Buffer;
  filename: string;
}

// Helvetica (WinAnsi) can't encode codepoints > 255; map the common typographic
// characters that show up in filenames to plain equivalents, then drop anything
// else (emoji, exotic scripts) so drawText never throws.
function sanitizeForFont(s: string): string {
  const mapped = s
    .replace(/[‒–—―]/g, '-') // dashes → hyphen
    .replace(/[‘’‚‛]/g, "'") // single quotes
    .replace(/[“”„‟]/g, '"') // double quotes
    .replace(/…/g, '...'); // ellipsis
  return Array.from(mapped)
    .filter((ch) => {
      const c = ch.codePointAt(0)!;
      return c >= 0x20 && c <= 0xff;
    })
    .join('')
    .replace(/\s+/g, ' ') // collapse any gaps left by dropped chars
    .trim();
}

function documentTitle(filename: string): string {
  const base = filename.replace(/\.[^.\\/]+$/, '').trim();
  return sanitizeForFont(base || filename) || 'Anhang';
}

// Append each attached PDF's pages to the generated protocol, in field order,
// each preceded by a slim branded divider page carrying the file name.
// Encrypted / corrupt PDFs get a divider with a note instead of failing the
// whole download. Returns the base buffer untouched if there is nothing to add.
export async function appendPdfAttachments(
  baseBuffer: Buffer,
  attachments: PdfDocAttachment[]
): Promise<Buffer> {
  if (attachments.length === 0) return baseBuffer;

  const outDoc = await PDFDocument.load(baseBuffer);
  const bold = await outDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await outDoc.embedFont(StandardFonts.Helvetica);

  for (const att of attachments) {
    const title = documentTitle(att.filename);

    // Divider page: green bar + "ANHANG" caption + filename near the top.
    const divider = outDoc.addPage(A4);
    const { height } = divider.getSize();
    const yTitle = height - 96;
    divider.drawRectangle({ x: 48, y: yTitle - 4, width: 4, height: 20, color: FL_GREEN });
    divider.drawText('ANHANG', { x: 62, y: yTitle + 22, size: 8, font: bold, color: GRAY });
    divider.drawText(title, { x: 62, y: yTitle, size: 15, font: bold, color: DARK });

    let copied;
    try {
      const src = await PDFDocument.load(att.bytes, { ignoreEncryption: true });
      copied = await outDoc.copyPages(src, src.getPageIndices());
    } catch {
      divider.drawText(
        'Dieses PDF konnte nicht eingebettet werden (evtl. passwortgeschutzt).',
        { x: 62, y: yTitle - 24, size: 10, font: regular, color: GRAY }
      );
      continue;
    }
    for (const p of copied) outDoc.addPage(p);
  }

  const bytes = await outDoc.save();
  return Buffer.from(bytes);
}
