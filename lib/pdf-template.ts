import type { SessionRecord } from './airtable';

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

function parseLines(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map(l => l.trim())
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
      }))
    : lines.map(line => ({
        text: line,
        fontSize: 10,
        color: DARK,
        margin: [0, 0, 0, 2],
      }));

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

export async function generatePdfBuffer(
  session: SessionRecord,
  logoDataUrl: string
): Promise<Buffer> {
  const sessionDate = formatDate(session.datum);
  const sel = session.exportSelection;
  const showNotizen = sel.includes('Notiz') || sel.length === 0;
  const showToDos = sel.includes('To-Dos');
  const showRoutinen = sel.includes('Routinen');
  const showAffirmationen = sel.includes('Affirmation');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections: any[] = [
    ...(showNotizen ? buildSection('SESSION NOTIZEN', session.notizen, false) : []),
    ...(showToDos ? buildSection('TO-DOS', session.toDos, true) : []),
    ...(showRoutinen ? buildSection('ROUTINEN', session.routinen, true) : []),
    ...(showAffirmationen ? buildSection('AFFIRMATIONEN', session.affirmationen, true) : []),
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
                text: 'SESSION PROTOKOLL · VERTRAULICH',
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
          text: `Erstellt am ${new Date().toLocaleDateString('de-DE')} · Nur für interne Verwendung`,
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
