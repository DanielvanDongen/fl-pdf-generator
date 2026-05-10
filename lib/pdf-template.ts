import type { SessionRecord } from './airtable';

export interface AttachmentImage {
  dataUrl: string;
  filename: string;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmakePrinter = require('pdfmake');
// eslint-disable-next-line @typescript-eslint/no-require-imports
pdfmakePrinter.addFonts(require('pdfmake/standard-fonts/Helvetica'));

const FL_GREEN = '#00C136';
const DARK = '#1A1A1A';
const GRAY = '#6B7280';
const LIGHT_GRAY = '#F3F4F6';
const BORDER = '#E5E7EB';

const BODY_LINE_HEIGHT = 1.35;
const BODY_FONT_SIZE = 10;
const PARAGRAPH_GAP = 6;
const LIST_ITEM_GAP = 5;

// A4 width 595pt − left/right margins 48+48 = 499pt usable width
const CONTENT_WIDTH = 499;
// A4 height 842pt − top/bottom margins 40+48 − footer ≈ 720pt usable for one image
const ATTACHMENT_MAX_HEIGHT = 720;

function formatDate(dateStr: string): string {
  if (!dateStr) return '–';
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function stripUnsupported(text: string): string {
  return text.replace(/[^ -ſ–—''""]/gu, '');
}

function stripChecklistMarkers(line: string): string {
  return line
    .replace(/^\s*\[[ xX]?\]\s*/u, '')
    .replace(/^\s*[☐☑✓✔]\s*/u, '');
}

// ---------- Inline Markdown parsing ----------
type InlineRun = {
  text: string;
  bold?: boolean;
  italics?: boolean;
  decoration?: 'lineThrough';
};

// Parse **bold**, __bold__, *italic*, _italic_, ~~strike~~, `code` into pdfmake text runs.
function parseInline(input: string): InlineRun[] {
  const text = stripUnsupported(input);
  const runs: InlineRun[] = [];
  // Order: bold (** or __) > strike (~~) > code (`) > italic (* or _).
  // Simple non-nested tokenizer.
  const re =
    /(\*\*([^*\n]+)\*\*)|(__([^_\n]+)__)|(~~([^~\n]+)~~)|(`([^`\n]+)`)|(\*([^*\n]+)\*)|(_([^_\n]+)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    if (m[2] !== undefined) runs.push({ text: m[2], bold: true });
    else if (m[4] !== undefined) runs.push({ text: m[4], bold: true });
    else if (m[6] !== undefined) runs.push({ text: m[6], decoration: 'lineThrough' });
    else if (m[8] !== undefined) runs.push({ text: m[8] });
    else if (m[10] !== undefined) runs.push({ text: m[10], italics: true });
    else if (m[12] !== undefined) runs.push({ text: m[12], italics: true });
    last = re.lastIndex;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs.length > 0 ? runs : [{ text }];
}

// ---------- Block Markdown parsing ----------
type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: 'paragraph', text: para.join(' ') });
      para = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushPara();
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    const ulMatch = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (ulMatch) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*[-*+]\s+(.*)$/.exec(lines[i].trimEnd());
        if (!m) break;
        const cleaned = stripChecklistMarkers(m[1]).trim();
        if (cleaned) items.push(cleaned);
        i++;
      }
      if (items.length) blocks.push({ kind: 'ul', items });
      continue;
    }

    const olMatch = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (olMatch) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*\d+[.)]\s+(.*)$/.exec(lines[i].trimEnd());
        if (!m) break;
        const cleaned = stripChecklistMarkers(m[1]).trim();
        if (cleaned) items.push(cleaned);
        i++;
      }
      if (items.length) blocks.push({ kind: 'ol', items });
      continue;
    }

    // Plain line — could be a checkbox-only line (no leading bullet) we want to keep as bullet.
    const bareCheckbox = /^\s*\[[ xX]?\]\s+(.*)$/.exec(line);
    if (bareCheckbox) {
      flushPara();
      const items: string[] = [stripChecklistMarkers(bareCheckbox[1]).trim()];
      while (i + 1 < lines.length) {
        const next = /^\s*\[[ xX]?\]\s+(.*)$/.exec(lines[i + 1].trimEnd());
        if (!next) break;
        items.push(stripChecklistMarkers(next[1]).trim());
        i++;
      }
      blocks.push({ kind: 'ul', items: items.filter(Boolean) });
      i++;
      continue;
    }

    para.push(stripChecklistMarkers(line.replace(/^#{1,6}\s*/, '')));
    i++;
  }
  flushPara();
  return blocks;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blockToContent(block: Block): any {
  if (block.kind === 'heading') {
    const fontSize = block.level <= 2 ? 12 : 11;
    return {
      text: parseInline(block.text),
      bold: true,
      fontSize,
      color: DARK,
      lineHeight: BODY_LINE_HEIGHT,
      margin: [0, 4, 0, 6],
    };
  }
  if (block.kind === 'ul') {
    return {
      stack: block.items.map((item) => ({
        columns: [
          { text: '›', width: 14, bold: true, color: FL_GREEN, fontSize: BODY_FONT_SIZE },
          {
            text: parseInline(item),
            fontSize: BODY_FONT_SIZE,
            color: DARK,
            lineHeight: BODY_LINE_HEIGHT,
          },
        ],
        margin: [0, 0, 0, LIST_ITEM_GAP],
      })),
    };
  }
  if (block.kind === 'ol') {
    return {
      stack: block.items.map((item, idx) => ({
        columns: [
          {
            text: `${idx + 1}.`,
            width: 16,
            bold: true,
            color: FL_GREEN,
            fontSize: BODY_FONT_SIZE,
          },
          {
            text: parseInline(item),
            fontSize: BODY_FONT_SIZE,
            color: DARK,
            lineHeight: BODY_LINE_HEIGHT,
          },
        ],
        margin: [0, 0, 0, LIST_ITEM_GAP],
      })),
    };
  }
  // paragraph
  return {
    text: parseInline(block.text),
    fontSize: BODY_FONT_SIZE,
    color: DARK,
    lineHeight: BODY_LINE_HEIGHT,
    margin: [0, 0, 0, PARAGRAPH_GAP],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSection(title: string, text: string | null): any[] {
  if (!text || !text.trim()) return [];
  const blocks = parseBlocks(text);
  if (blocks.length === 0) return [];
  const items = blocks.map(blockToContent);

  return [
    {
      stack: [
        {
          columns: [
            {
              canvas: [{ type: 'rect', x: 0, y: 1, w: 3, h: 12, r: 1.5, color: FL_GREEN }],
              width: 11,
            },
            { text: title, fontSize: 9, bold: true, color: FL_GREEN },
          ],
          margin: [0, 0, 0, 8],
        },
        {
          table: {
            widths: ['*'],
            body: [[{ stack: items }]],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => BORDER,
            vLineColor: () => BORDER,
            paddingLeft: () => 12,
            paddingRight: () => 12,
            paddingTop: () => 12,
            paddingBottom: () => 12,
          },
        },
      ],
      margin: [0, 0, 0, 18],
    },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAttachmentsSection(images: AttachmentImage[]): any[] {
  if (images.length === 0) return [];

  // One image per row, full content width — effectively whole-page view.
  const items = images.map((img) => ({
    stack: [
      {
        image: img.dataUrl,
        fit: [CONTENT_WIDTH, ATTACHMENT_MAX_HEIGHT],
        alignment: 'center',
      },
      {
        text: img.filename,
        fontSize: 8,
        color: GRAY,
        alignment: 'center',
        margin: [0, 6, 0, 0],
      },
    ],
    unbreakable: true,
    margin: [0, 0, 0, 18],
  }));

  return [
    {
      columns: [
        {
          canvas: [{ type: 'rect', x: 0, y: 1, w: 3, h: 12, r: 1.5, color: FL_GREEN }],
          width: 11,
        },
        { text: 'ANHÄNGE', fontSize: 9, bold: true, color: FL_GREEN },
      ],
      margin: [0, 0, 0, 10],
    },
    ...items,
  ];
}

export async function generatePdfBuffer(
  session: SessionRecord,
  logoDataUrl: string,
  attachmentImages: AttachmentImage[] = []
): Promise<Buffer> {
  const sessionDate = formatDate(session.datum);
  const sel = session.exportSelection;
  const showAll = sel.length === 0;
  const showNotizen = showAll || sel.includes('Notiz');
  const showZusammenfassung = showAll || sel.includes('Zusammenfassung Transkript');
  const showToDos = showAll || sel.includes('To-Dos');
  const showToDosAbgeschlossen = showAll || sel.includes('To-Dos (abgeschlossen)');
  const showRoutinen = showAll || sel.includes('Routinen');
  const showAffirmationen = showAll || sel.includes('Affirmation');
  const showAnhänge = showAll || sel.includes('Anhänge');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections: any[] = [
    ...(showNotizen ? buildSection('SESSION NOTIZEN', session.notizen) : []),
    ...(showZusammenfassung
      ? buildSection('ZUSAMMENFASSUNG TRANSKRIPT', session.zusammenfassungTranskript)
      : []),
    ...(showToDos ? buildSection('TO-DOS', session.toDos) : []),
    ...(showToDosAbgeschlossen
      ? buildSection('TO-DOS (ABGESCHLOSSEN)', session.toDosAbgeschlossen)
      : []),
    ...(showRoutinen ? buildSection('ROUTINEN', session.routinen) : []),
    ...(showAffirmationen ? buildSection('AFFIRMATIONEN', session.affirmationen) : []),
    ...(showAnhänge ? buildAttachmentsSection(attachmentImages) : []),
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metaRows: any[] = [
    {
      columns: [
        {
          stack: [
            { text: 'DATUM', fontSize: 7.5, color: GRAY },
            { text: sessionDate, bold: true, fontSize: 10, margin: [0, 2, 0, 0] },
          ],
        },
        {
          stack: [
            { text: 'SESSION-TYP', fontSize: 7.5, color: GRAY },
            { text: session.sessionTyp, bold: true, fontSize: 10, margin: [0, 2, 0, 0] },
          ],
        },
      ],
      margin: [0, 0, 0, 8],
    },
    {
      columns: [
        {
          stack: [
            { text: 'SPIELER', fontSize: 7.5, color: GRAY },
            { text: session.spielerName, bold: true, fontSize: 10, margin: [0, 2, 0, 0] },
          ],
        },
        {
          stack: [
            { text: 'COACH', fontSize: 7.5, color: GRAY },
            { text: session.coachName, bold: true, fontSize: 10, margin: [0, 2, 0, 0] },
          ],
        },
      ],
      margin: [0, 0, 0, session.dauer || session.medium ? 8 : 0],
    },
  ];

  if (session.dauer || session.medium) {
    metaRows.push({
      columns: [
        session.dauer
          ? {
              stack: [
                { text: 'DAUER', fontSize: 7.5, color: GRAY },
                {
                  text: `${session.dauer} Minuten`,
                  bold: true,
                  fontSize: 10,
                  margin: [0, 2, 0, 0],
                },
              ],
            }
          : { text: '' },
        session.medium
          ? {
              stack: [
                { text: 'MEDIUM', fontSize: 7.5, color: GRAY },
                { text: session.medium, bold: true, fontSize: 10, margin: [0, 2, 0, 0] },
              ],
            }
          : { text: '' },
      ],
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docDef: any = {
    pageSize: 'A4',
    pageMargins: [48, 40, 48, 48],
    defaultStyle: {
      font: 'Helvetica',
      fontSize: BODY_FONT_SIZE,
      color: DARK,
      lineHeight: BODY_LINE_HEIGHT,
    },
    content: [
      // Header: logo + brand
      {
        columns: [
          { image: logoDataUrl, width: 56, height: 56 },
          {
            stack: [
              { text: 'FOOTBALL LEVERAGE', fontSize: 16, bold: true, color: FL_GREEN },
              {
                text: 'SESSION PROTOKOLL',
                fontSize: 9,
                color: GRAY,
                margin: [0, 2, 0, 0],
              },
            ],
            alignment: 'right',
          },
        ],
        margin: [0, 0, 0, 16],
      },
      // Green divider line
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: CONTENT_WIDTH,
            y2: 0,
            lineWidth: 2,
            lineColor: FL_GREEN,
          },
        ],
        margin: [0, 0, 0, 24],
      },
      // Meta box
      {
        table: {
          widths: ['*'],
          body: [[{ stack: metaRows, fillColor: LIGHT_GRAY }]],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 14,
          paddingRight: () => 14,
          paddingTop: () => 14,
          paddingBottom: () => 14,
        },
        margin: [0, 0, 0, 20],
      },
      ...sections,
    ],
    footer: (_page: number, _count: number) => ({
      columns: [
        {
          text: `Erstellt am ${new Date().toLocaleDateString('de-DE')}`,
          fontSize: 7.5,
          color: GRAY,
        },
        {
          text: 'Football Leverage®',
          fontSize: 7.5,
          color: FL_GREEN,
          bold: true,
          alignment: 'right',
        },
      ],
      margin: [48, 8, 48, 0],
    }),
  };

  const doc = pdfmakePrinter.createPdf(docDef);
  return doc.getBuffer() as Promise<Buffer>;
}
