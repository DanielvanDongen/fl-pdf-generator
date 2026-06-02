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
const GRID = '#C5CCDA'; // light slate-gray gridlines (visible on white + slate)

// 16:9 slide
const PAGE_W = 960;
const PAGE_H = 540;

// Page-3 table geometry (full-bleed: pageMargins are 0)
const FIRST_COL_W = 132;
const HEADER_H = 34;
// A few points of slack below the header so all 4 rows + borders fit on one page.
const ROW_H = Math.floor((PAGE_H - HEADER_H - 8) / 4); // ≈124 → table fills the slide
const PILLAR_BLOCK_H = 68; // icon + gap + label, for vertical centering

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
    // small top margin so bullets aren't glued to the cell's top edge
    margin: [0, 14, 0, 0],
    stack: items.map((line) => ({
      columns: [
        { text: '•', width: 12, color: SLATE, fontSize: 9.5, bold: true },
        { text: line.trim(), width: '*', color: TEXT, fontSize: 9.5, lineHeight: 1.2 },
      ],
      margin: [0, 0, 0, 5],
    })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pillarCell(label: string, iconDataUrl: string): any {
  // Vertically center the icon + label block inside the fixed-height slate cell.
  const topMargin = Math.max(0, Math.round((ROW_H - PILLAR_BLOCK_H) / 2));
  return {
    fillColor: SLATE,
    stack: [
      { image: iconDataUrl, width: 44, alignment: 'center', margin: [0, 0, 0, 8] },
      { text: label, color: WHITE, bold: true, fontSize: 12.5, alignment: 'center', characterSpacing: 0.5 },
    ],
    margin: [0, topMargin, 0, 0],
  };
}

export async function generateIdpBuffer(
  data: IdpData,
  assets: IdpAssets
): Promise<Buffer> {
  const { logoDataUrl, iconDataUrls } = assets;

  // ---- Page 3: pillar table ----
  // Header text vertically centered in the HEADER_H-tall row (paddingTop is 0).
  const headerTopMargin = Math.max(0, Math.round((HEADER_H - 13) / 2));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerCell = (label: string): any => ({
    text: label,
    fillColor: SLATE,
    color: WHITE,
    bold: true,
    fontSize: 12.5,
    characterSpacing: 0.5,
    alignment: 'center',
    margin: [0, headerTopMargin, 0, 0],
  });
  const headerRow = [headerCell('SÄULEN'), headerCell('STÄRKEN'), headerCell('ENTWICKLUNGSFELDER')];

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
    // Zero page margins → the page-3 table is full-bleed. Pages 1-2 inset content via element margins.
    pageMargins: [0, 0, 0, 0],
    defaultStyle: { font: 'Helvetica', color: TEXT },
    background: (currentPage: number) =>
      currentPage <= 2
        ? { canvas: [{ type: 'rect', x: 0, y: 0, w: PAGE_W, h: PAGE_H, color: BLACK }] }
        : null,
    content: [
      // ---------- PAGE 1: cover ----------
      { image: logoDataUrl, width: 620, alignment: 'center', margin: [0, 92, 0, 0] },
      { text: '', pageBreak: 'after' },

      // ---------- PAGE 2: player info ----------
      { image: logoDataUrl, width: 300, alignment: 'center', margin: [0, 46, 0, 0] },
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
        margin: [60, 150, 60, 0],
      },
      { text: '', pageBreak: 'after' },

      // ---------- PAGE 3: pillar table (full-bleed) ----------
      {
        table: {
          widths: [FIRST_COL_W, '*', '*'],
          headerRows: 1,
          dontBreakRows: true,
          // Equal pillar rows that fill the full slide height under the header.
          heights: (row: number) => (row === 0 ? HEADER_H : ROW_H),
          body: [headerRow, ...dataRows],
        },
        layout: {
          // Thin, clean gridlines visible on both white content cells and slate cells.
          hLineWidth: () => 1.5,
          vLineWidth: () => 1.5,
          hLineColor: () => GRID,
          vLineColor: () => GRID,
          paddingLeft: () => 16,
          paddingRight: () => 16,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
      },
    ],
  };

  const doc = pdfmakePrinter.createPdf(docDef);
  return doc.getBuffer() as Promise<Buffer>;
}
