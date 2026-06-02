// IDP (Individueller Entwicklungsplan) — Tactic Leverage Scouting-Analyse PDF.
// 3-page 16:9 slide deck: cover · player info · pillar table.
// Content is supplied fully structured by the caller (no AI/parsing here).

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmakePrinter = require('pdfmake');
// eslint-disable-next-line @typescript-eslint/no-require-imports
pdfmakePrinter.addFonts(require('pdfmake/standard-fonts/Helvetica'));

// ---- Tactic Leverage brand ----
const SLATE = '#4A5881';
const WHITE = '#FFFFFF';
const BLACK = '#000000';
const TEXT = '#1F2937';
const BORDER = '#FFFFFF';

// 16:9 slide
const PAGE_W = 960;
const PAGE_H = 540;
const H_MARGIN = 40;

const PILLARS = [
  { key: 'physis', label: 'PHYSIS' },
  { key: 'technik', label: 'TECHNIK' },
  { key: 'taktik', label: 'TAKTIK' },
  { key: 'mental', label: 'MENTAL' },
] as const;

export type PillarKey = (typeof PILLARS)[number]['key'];

export interface PillarContent {
  staerken: string[];
  entwicklung: string[];
}

export interface IdpData {
  name: string;
  position: string;
  geburtsdatum: string; // already formatted DD.MM.YYYY (or raw ISO — formatted defensively)
  liga: string;
  spiele: string[];
  physis: PillarContent;
  technik: PillarContent;
  taktik: PillarContent;
  mental: PillarContent;
}

export interface IdpAssets {
  logoDataUrl: string;
  iconDataUrls: Record<PillarKey, string>;
}

function formatDateMaybe(s: string): string {
  if (!s) return '–';
  // already DD.MM.YYYY → keep
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bulletList(lines: string[]): any {
  const items = (lines ?? []).filter((l) => l && l.trim());
  if (items.length === 0) {
    return { text: '–', color: TEXT, fontSize: 11 };
  }
  return {
    stack: items.map((line) => ({
      columns: [
        { text: '•', width: 11, color: SLATE, fontSize: 9, bold: true },
        { text: line.trim(), width: '*', color: TEXT, fontSize: 9, lineHeight: 1.15 },
      ],
      margin: [0, 0, 0, 3],
    })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pillarCell(label: string, iconDataUrl: string): any {
  return {
    fillColor: SLATE,
    stack: [
      { image: iconDataUrl, width: 40, alignment: 'center', margin: [0, 0, 0, 8] },
      { text: label, color: WHITE, bold: true, fontSize: 12, alignment: 'center' },
    ],
  };
}

export async function generateIdpBuffer(
  data: IdpData,
  assets: IdpAssets
): Promise<Buffer> {
  const { logoDataUrl, iconDataUrls } = assets;

  // ---- Page 3: pillar table ----
  const headerRow = [
    { text: 'SÄULEN', fillColor: SLATE, color: WHITE, bold: true, fontSize: 12, alignment: 'center', margin: [0, 6, 0, 6] },
    { text: 'STÄRKEN', fillColor: SLATE, color: WHITE, bold: true, fontSize: 12, alignment: 'center', margin: [0, 6, 0, 6] },
    { text: 'ENTWICKLUNGSFELDER', fillColor: SLATE, color: WHITE, bold: true, fontSize: 12, alignment: 'center', margin: [0, 6, 0, 6] },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataRows: any[][] = PILLARS.map((p) => {
    const content = data[p.key];
    return [
      pillarCell(p.label, iconDataUrls[p.key]),
      bulletList(content?.staerken ?? []),
      bulletList(content?.entwicklung ?? []),
    ];
  });

  // ---- Player meta (page 2) ----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metaLine = (label: string, value: string): any => ({
    text: [
      { text: `${label}: `, bold: true, color: WHITE },
      { text: value || '–', color: WHITE },
    ],
    fontSize: 17,
    margin: [0, 0, 0, 10],
  });

  const spieleList = (data.spiele ?? []).filter((s) => s && s.trim());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docDef: any = {
    pageSize: { width: PAGE_W, height: PAGE_H },
    pageMargins: [H_MARGIN, 16, H_MARGIN, 16],
    defaultStyle: { font: 'Helvetica', color: TEXT },
    background: (currentPage: number) =>
      currentPage <= 2
        ? { canvas: [{ type: 'rect', x: 0, y: 0, w: PAGE_W, h: PAGE_H, color: BLACK }] }
        : null,
    content: [
      // ---------- PAGE 1: cover ----------
      { image: logoDataUrl, width: 620, alignment: 'center', margin: [0, 74, 0, 0] },
      { text: '', pageBreak: 'after' },

      // ---------- PAGE 2: player info ----------
      { image: logoDataUrl, width: 300, alignment: 'center', margin: [0, 30, 0, 0] },
      {
        columns: [
          {
            width: '52%',
            stack: [
              metaLine('Name', data.name),
              metaLine('Position', data.position),
              metaLine('Geburtsdatum', formatDateMaybe(data.geburtsdatum)),
              metaLine('Liga', data.liga),
            ],
          },
          {
            width: '48%',
            stack: [
              { text: 'Spiele:', bold: true, color: WHITE, fontSize: 17, margin: [0, 0, 0, 10] },
              spieleList.length
                ? {
                    stack: spieleList.map((s) => ({
                      columns: [
                        { text: '•', width: 16, color: WHITE, fontSize: 16 },
                        { text: s.trim(), width: '*', color: WHITE, fontSize: 16, lineHeight: 1.25 },
                      ],
                      margin: [0, 0, 0, 6],
                    })),
                  }
                : { text: '–', color: WHITE, fontSize: 16 },
            ],
          },
        ],
        margin: [24, 150, 24, 0],
      },
      { text: '', pageBreak: 'after' },

      // ---------- PAGE 3: pillar table ----------
      {
        table: {
          widths: [128, '*', '*'],
          headerRows: 1,
          dontBreakRows: true,
          // Equal pillar rows that fill the slide height under the header.
          heights: (row: number) => (row === 0 ? 24 : 102),
          body: [headerRow, ...dataRows],
        },
        layout: {
          hLineWidth: () => 3,
          vLineWidth: () => 3,
          hLineColor: () => BORDER,
          vLineColor: () => BORDER,
          paddingLeft: () => 12,
          paddingRight: () => 12,
          paddingTop: (row: number) => (row === 0 ? 0 : 6),
          paddingBottom: (row: number) => (row === 0 ? 0 : 6),
        },
      },
    ],
  };

  const doc = pdfmakePrinter.createPdf(docDef);
  return doc.getBuffer() as Promise<Buffer>;
}
