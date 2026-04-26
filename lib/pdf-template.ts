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

function formatDate(dateStr: string): string {
  if (!dateStr) return '–';
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function stripUnsupported(text: string): string {
  // Keep Basic Latin (U+0020-U+007E), Latin-1 Supplement (U+00A0-U+00FF),
  // Latin Extended-A (U+0100-U+017F) — covers all German umlauts and standard punctuation.
  // Also keep common typographic chars: en/em dash, smart quotes.
  // Everything else (emoji, symbols, etc.) is silently removed to prevent layout glitches.
  return text.replace(/[^ -ſ–—''""]/gu, '');
}

function parseLines(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map(l => stripUnsupported(l.replace(/^#{1,6}\s*/, '').trim()))
    .filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSection(title: string, text: string | null, asList = false): any[] {
  const lines = parseLines(text);
  if (lines.length === 0) return [];

  const items = asList
    ? lines.map(line => ({
        columns: [
          { text: '›', width: 14, bold: true, color: FL_GREEN, fontSize: 10 },
          { text: line, fontSize: 10, color: DARK },
        ],
        margin: [0, 0, 0, 5],
        unbreakable: true,
      }))
    : lines.map(line => ({
        text: line,
        fontSize: 10,
        color: DARK,
        margin: [0, 0, 0, 2],
        unbreakable: true,
      }));

  // Sections with ≤ 15 lines are guaranteed to fit on one page: keep them together.
  // Larger sections (e.g. long Affirmationen) must flow — unbreakable: true would drop them.
  const blockFitsOnePage = lines.length <= 15;

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
      unbreakable: blockFitsOnePage,
      margin: [0, 0, 0, 18],
    },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAttachmentsSection(images: AttachmentImage[]): any[] {
  if (images.length === 0) return [];

  // Two images per row, fit within available column width
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];
  for (let i = 0; i < images.length; i += 2) {
    const left = images[i];
    const right = images[i + 1];
    rows.push({
      columns: [
        {
          stack: [
            { image: left.dataUrl, fit: [231, 200], margin: [0, 0, 0, 4] },
            { text: left.filename, fontSize: 7.5, color: GRAY },
          ],
        },
        right
          ? {
              stack: [
                { image: right.dataUrl, fit: [231, 200], margin: [0, 0, 0, 4] },
                { text: right.filename, fontSize: 7.5, color: GRAY },
              ],
            }
          : { text: '' },
      ],
      columnGap: 12,
      margin: [0, 0, 0, 12],
    });
  }

  return [
    {
      stack: [
        {
          columns: [
            {
              canvas: [{ type: 'rect', x: 0, y: 1, w: 3, h: 12, r: 1.5, color: FL_GREEN }],
              width: 11,
            },
            { text: 'ANHÄNGE', fontSize: 9, bold: true, color: FL_GREEN },
          ],
          margin: [0, 0, 0, 8],
        },
        ...rows,
      ],
      margin: [0, 0, 0, 18],
    },
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
  const showToDos = showAll || sel.includes('To-Dos');
  const showRoutinen = showAll || sel.includes('Routinen');
  const showAffirmationen = showAll || sel.includes('Affirmation');
  const showAnhänge = showAll || sel.includes('Anhänge');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections: any[] = [
    ...(showNotizen ? buildSection('SESSION NOTIZEN', session.notizen, false) : []),
    ...(showToDos ? buildSection('TO-DOS', session.toDos, true) : []),
    ...(showRoutinen ? buildSection('ROUTINEN', session.routinen, true) : []),
    ...(showAffirmationen ? buildSection('AFFIRMATIONEN', session.affirmationen, true) : []),
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
    defaultStyle: { font: 'Helvetica', fontSize: 10, color: DARK },
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
            x2: 499,
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
