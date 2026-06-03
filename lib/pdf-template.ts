import type { SessionRecord } from './airtable';

export interface AttachmentImage {
  dataUrl: string;
  filename: string;
}

export interface TextAttachment {
  text: string;
  filename: string;
}

// An attachment rendered into the protocol: either an embedded image or a
// text document (.txt / .md) converted to real, formatted body text.
export type PdfAttachment =
  | ({ kind: 'image' } & AttachmentImage)
  | ({ kind: 'text' } & TextAttachment);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmakePrinter = require('pdfmake');
// eslint-disable-next-line @typescript-eslint/no-require-imports
pdfmakePrinter.addFonts(require('pdfmake/standard-fonts/Helvetica'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
pdfmakePrinter.addFonts(require('pdfmake/standard-fonts/Courier'));

const FL_GREEN = '#00C136';
const DARK = '#1A1A1A';
const GRAY = '#6B7280';
const LIGHT_GRAY = '#F3F4F6';
const BORDER = '#E5E7EB';
const LINK_BLUE = '#0066CC';
const QUOTE_BG = '#F9FAFB';

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

// Like stripUnsupported but preserves newlines for code blocks
function stripUnsupportedKeepNewlines(text: string): string {
  return text.replace(/[^\n -ſ–—''""]/gu, '');
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
  decoration?: 'lineThrough' | 'underline';
  color?: string;
  background?: string;
  link?: string;
  font?: string;
};

type InlineStyle = Omit<InlineRun, 'text'>;

// Find the earliest matching inline marker. Returns null if none found.
function findNextMarker(
  text: string
): { start: number; end: number; inner: string; style: InlineStyle } | null {
  // Bold, strike, code, links scanned before italic so ** beats *.
  // ***triple*** is treated as bold+italic via nested re-parse.
  const patterns: Array<{ re: RegExp; build: (m: RegExpExecArray) => { inner: string; style: InlineStyle; rawLen: number } }> = [
    {
      // Backslash escape: `\*`, `\_`, `\#`, … → literal char, never a marker.
      // Airtable emits these when a coach pastes markdown it can't apply as
      // real formatting (e.g. ** spanning a heading→paragraph boundary).
      // Must run first so the escaped punctuation is consumed before any
      // emphasis pattern can mistake it for a marker.
      re: /\\([\\`*_{}\[\]()#+\-.!>~|])/g,
      build: (m) => ({ inner: '', style: {}, rawLen: m[0].length }),
    },
    {
      re: /\*\*\*([^\n]+?)\*\*\*/g,
      build: (m) => ({ inner: `*${m[1]}*`, style: { bold: true }, rawLen: m[0].length }),
    },
    {
      re: /___([^\n]+?)___/g,
      build: (m) => ({ inner: `_${m[1]}_`, style: { bold: true }, rawLen: m[0].length }),
    },
    {
      re: /\*\*([^\n]+?)\*\*/g,
      build: (m) => ({ inner: m[1], style: { bold: true }, rawLen: m[0].length }),
    },
    {
      re: /__([^\n]+?)__/g,
      build: (m) => ({ inner: m[1], style: { bold: true }, rawLen: m[0].length }),
    },
    {
      re: /~~([^\n]+?)~~/g,
      build: (m) => ({ inner: m[1], style: { decoration: 'lineThrough' }, rawLen: m[0].length }),
    },
    {
      re: /`([^`\n]+)`/g,
      build: (m) => ({
        inner: '',
        // code is terminal — content is m[1] with no further parsing
        style: { background: LIGHT_GRAY, color: DARK, font: 'Courier' },
        rawLen: m[0].length,
      }),
    },
    {
      re: /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
      build: (m) => ({
        inner: '',
        style: { link: m[2], color: LINK_BLUE, decoration: 'underline' },
        rawLen: m[0].length,
      }),
    },
    {
      // italic *…* — emphasized: not preceded/followed by * (handled by trying after bold patterns)
      re: /\*([^*\n]+?)\*/g,
      build: (m) => ({ inner: m[1], style: { italics: true }, rawLen: m[0].length }),
    },
    {
      re: /_([^_\n]+?)_/g,
      build: (m) => ({ inner: m[1], style: { italics: true }, rawLen: m[0].length }),
    },
  ];

  let best: { start: number; end: number; inner: string; style: InlineStyle; terminalText?: string } | null = null;

  for (const { re, build } of patterns) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (!m) continue;
    const built = build(m);
    if (best && m.index >= best.start) continue;

    // Determine inner content (for terminal markers like code/link, capture literal text)
    let inner = built.inner;
    let terminalText: string | undefined;
    if (re.source.startsWith('\\\\')) {
      terminalText = m[1]; // backslash escape - the escaped char, emitted literally
      inner = '';
    } else if (re.source.startsWith('`')) {
      terminalText = m[1]; // code content - literal
      inner = '';
    } else if (re.source.startsWith('\\[')) {
      terminalText = m[1]; // link label - literal (no further inline parsing inside link)
      inner = '';
    }

    best = {
      start: m.index,
      end: m.index + built.rawLen,
      inner,
      style: built.style,
      terminalText,
    };
  }

  if (!best) return null;
  return best.terminalText !== undefined
    ? { start: best.start, end: best.end, inner: best.terminalText, style: { ...best.style, _terminal: true } as InlineStyle & { _terminal?: boolean } }
    : { start: best.start, end: best.end, inner: best.inner, style: best.style };
}

function mergeStyle(base: InlineStyle, add: InlineStyle): InlineStyle {
  return { ...base, ...add };
}

function parseInline(input: string, base: InlineStyle = {}): InlineRun[] {
  const text = stripUnsupported(input);
  const runs: InlineRun[] = [];
  let i = 0;

  while (i < text.length) {
    const rest = text.slice(i);
    const found = findNextMarker(rest);
    if (!found) {
      runs.push({ ...base, text: rest });
      break;
    }
    if (found.start > 0) {
      runs.push({ ...base, text: rest.slice(0, found.start) });
    }
    const isTerminal = (found.style as InlineStyle & { _terminal?: boolean })._terminal;
    const cleanStyle: InlineStyle = { ...found.style };
    delete (cleanStyle as InlineStyle & { _terminal?: boolean })._terminal;
    if (isTerminal) {
      // code / link: do not recurse into inner
      runs.push({ ...mergeStyle(base, cleanStyle), text: found.inner });
    } else {
      runs.push(...parseInline(found.inner, mergeStyle(base, cleanStyle)));
    }
    i += found.end;
  }

  return runs.length > 0 ? runs : [{ ...base, text }];
}

// ---------- Block Markdown parsing ----------
type ListItem = {
  text: string;
  children?: { ordered: boolean; items: ListItem[] };
};

type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'ul'; items: ListItem[] }
  | { kind: 'ol'; items: ListItem[] }
  | { kind: 'blockquote'; text: string }
  | { kind: 'codeblock'; text: string }
  | { kind: 'hr' };

const UL_RE = /^(\s*)(?:[-*+]|\[[ xX]?\]|[☐☑✓✔])\s+(.*)$/u;
const OL_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const HR_RE = /^\s*(?:-\s*){3,}\s*$|^\s*(?:\*\s*){3,}\s*$|^\s*(?:_\s*){3,}\s*$/;
const BLOCKQUOTE_RE = /^\s*>\s?(.*)$/;
const FENCE_RE = /^\s*```/;

function getIndent(line: string): number {
  const m = /^(\s*)/.exec(line);
  return m ? m[1].replace(/\t/g, '    ').length : 0;
}

function matchListItem(line: string): { indent: number; ordered: boolean; text: string } | null {
  const u = UL_RE.exec(line);
  if (u) return { indent: getIndent(line), ordered: false, text: stripChecklistMarkers(u[2]) };
  const o = OL_RE.exec(line);
  if (o) return { indent: getIndent(line), ordered: true, text: stripChecklistMarkers(o[3]) };
  return null;
}

// Parse a contiguous list starting at index `start`. Returns items + lines consumed.
function parseListAt(
  lines: string[],
  start: number
): { ordered: boolean; items: ListItem[]; consumed: number } {
  const first = matchListItem(lines[start])!;
  const baseIndent = first.indent;
  const ordered = first.ordered;
  const items: ListItem[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // blank: peek ahead for more list items at same/deeper indent
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length) {
        const peek = matchListItem(lines[j]);
        if (peek && peek.indent >= baseIndent) {
          i = j;
          continue;
        }
      }
      break;
    }
    const m = matchListItem(line);
    if (!m) break;
    if (m.indent < baseIndent) break;
    if (m.indent > baseIndent) {
      // Belongs to a nested list under the previous item
      const nested = parseListAt(lines, i);
      const prev = items[items.length - 1];
      if (prev) {
        prev.children = { ordered: nested.ordered, items: nested.items };
      } else {
        // No prior item — treat as new list
        items.push({ text: '' });
        items[0].children = { ordered: nested.ordered, items: nested.items };
      }
      i += nested.consumed;
      continue;
    }
    // Same level — could be different ordered/unordered. If different, stop.
    if (m.ordered !== ordered) break;
    items.push({ text: m.text });
    i++;
    // Continuation lines (indented under this item, not a list marker)
    while (i < lines.length) {
      const nextLine = lines[i];
      if (!nextLine.trim()) break;
      const nm = matchListItem(nextLine);
      if (nm) break;
      const ni = getIndent(nextLine);
      if (ni > baseIndent) {
        items[items.length - 1].text += ' ' + nextLine.trim();
        i++;
        continue;
      }
      break;
    }
  }
  return { ordered, items, consumed: i - start };
}

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
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      i++;
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      flushPara();
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    // Fenced code block
    if (FENCE_RE.test(line)) {
      flushPara();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      blocks.push({ kind: 'codeblock', text: codeLines.join('\n') });
      continue;
    }

    // Heading
    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      flushPara();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    // Blockquote
    if (BLOCKQUOTE_RE.test(line)) {
      flushPara();
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const m = BLOCKQUOTE_RE.exec(lines[i]);
        if (!m) break;
        quoteLines.push(m[1]);
        i++;
      }
      blocks.push({ kind: 'blockquote', text: quoteLines.join('\n').trim() });
      continue;
    }

    // List (ul/ol with nesting)
    const listMatch = matchListItem(line);
    if (listMatch) {
      flushPara();
      const parsed = parseListAt(lines, i);
      blocks.push(
        parsed.ordered
          ? { kind: 'ol', items: parsed.items }
          : { kind: 'ul', items: parsed.items }
      );
      i += parsed.consumed;
      continue;
    }

    // Plain paragraph line
    para.push(stripChecklistMarkers(trimmed.replace(/^#{1,6}\s*/, '')));
    i++;
  }
  flushPara();
  return blocks;
}

// ---------- Render blocks to pdfmake content ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderListItems(items: ListItem[], ordered: boolean, depth: number): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  const indentPt = 14 * depth;

  items.forEach((item, idx) => {
    const marker = ordered ? `${idx + 1}.` : '›';
    out.push({
      columns: [
        {
          text: marker,
          width: ordered ? 18 : 14,
          bold: true,
          color: FL_GREEN,
          fontSize: BODY_FONT_SIZE,
        },
        {
          text: parseInline(item.text),
          fontSize: BODY_FONT_SIZE,
          color: DARK,
          lineHeight: BODY_LINE_HEIGHT,
        },
      ],
      margin: [indentPt, 0, 0, LIST_ITEM_GAP],
    });
    if (item.children) {
      out.push(
        ...renderListItems(item.children.items, item.children.ordered, depth + 1).map((node) => ({
          ...node,
          margin: [
            indentPt + 14,
            (node.margin?.[1] ?? 0) as number,
            0,
            (node.margin?.[3] ?? LIST_ITEM_GAP) as number,
          ],
        }))
      );
    }
  });

  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blockToContent(block: Block): any {
  if (block.kind === 'heading') {
    const fontSize = block.level <= 1 ? 13 : block.level === 2 ? 12 : 11;
    return {
      text: parseInline(block.text, { bold: true, color: DARK }),
      fontSize,
      lineHeight: BODY_LINE_HEIGHT,
      margin: [0, 6, 0, 6],
    };
  }
  if (block.kind === 'ul' || block.kind === 'ol') {
    return { stack: renderListItems(block.items, block.kind === 'ol', 0) };
  }
  if (block.kind === 'blockquote') {
    return {
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: parseInline(block.text, { color: GRAY, italics: true }),
              fontSize: BODY_FONT_SIZE,
              lineHeight: BODY_LINE_HEIGHT,
              fillColor: QUOTE_BG,
            },
          ],
        ],
      },
      layout: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hLineWidth: () => 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vLineWidth: (col: number) => (col === 0 ? 3 : 0),
        vLineColor: () => FL_GREEN,
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 8,
        paddingBottom: () => 8,
      },
      margin: [0, 0, 0, PARAGRAPH_GAP],
    };
  }
  if (block.kind === 'codeblock') {
    return {
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: stripUnsupportedKeepNewlines(block.text),
              font: 'Courier',
              fontSize: 9,
              color: DARK,
              lineHeight: 1.25,
              fillColor: LIGHT_GRAY,
              preserveLeadingSpaces: true,
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => BORDER,
        vLineColor: () => BORDER,
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 8,
        paddingBottom: () => 8,
      },
      margin: [0, 0, 0, PARAGRAPH_GAP],
    };
  }
  if (block.kind === 'hr') {
    return {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: CONTENT_WIDTH - 24,
          y2: 0,
          lineWidth: 0.5,
          lineColor: BORDER,
        },
      ],
      margin: [0, 6, 0, 10],
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
              // Full-height bar; the title text is nudged down so its glyphs
              // sit centered against the bar (columns rows are top-aligned).
              canvas: [{ type: 'rect', x: 0, y: 1, w: 3, h: 12, r: 1.5, color: FL_GREEN }],
              width: 11,
            },
            { text: title, fontSize: 9, bold: true, color: FL_GREEN, margin: [0, 2, 0, 0] },
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

// Drop the extension so a filename reads like a document title, not a file.
function documentTitle(filename: string): string {
  const base = filename.replace(/\.[^.\\/]+$/, '').trim();
  return stripUnsupported(base || filename);
}

// Render each attachment as its own titled document block. Images embed as
// before; text files (.txt/.md) become real, formatted body text. No generic
// "ANHÄNGE" label — each document carries its own filename as a heading.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDocumentsSection(attachments: PdfAttachment[]): any[] {
  if (attachments.length === 0) return [];

  const cardLayout = {
    hLineWidth: () => 1,
    vLineWidth: () => 1,
    hLineColor: () => BORDER,
    vLineColor: () => BORDER,
    paddingLeft: () => 12,
    paddingRight: () => 12,
    paddingTop: () => 12,
    paddingBottom: () => 12,
  };

  return attachments.map((att) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    if (att.kind === 'image') {
      body = {
        image: att.dataUrl,
        // −24 leaves room for the card's left/right padding.
        fit: [CONTENT_WIDTH - 24, ATTACHMENT_MAX_HEIGHT],
        alignment: 'center',
      };
    } else {
      const blocks = parseBlocks(att.text);
      const items = blocks.length
        ? blocks.map(blockToContent)
        : [{ text: '–', fontSize: BODY_FONT_SIZE, color: GRAY }];
      body = { stack: items };
    }

    return {
      stack: [
        {
          columns: [
            {
              // Full-height bar; title text nudged down to center against it.
              canvas: [{ type: 'rect', x: 0, y: 1, w: 3, h: 14, r: 1.5, color: FL_GREEN }],
              width: 11,
            },
            { text: documentTitle(att.filename), fontSize: 11, bold: true, color: DARK, margin: [0, 2, 0, 0] },
          ],
          margin: [0, 0, 0, 8],
        },
        {
          table: { widths: ['*'], body: [[{ stack: [body] }]] },
          layout: cardLayout,
        },
      ],
      // Keep an image glued to its title (it fits on one page). Text docs may
      // run long, so they must stay breakable across pages.
      unbreakable: att.kind === 'image',
      margin: [0, 0, 0, 18],
    };
  });
}

export async function generatePdfBuffer(
  session: SessionRecord,
  logoDataUrl: string,
  attachments: PdfAttachment[] = []
): Promise<Buffer> {
  const sessionDate = formatDate(session.datum);
  const sel = session.exportSelection;
  const showAll = sel.length === 0;
  const showNotizen = showAll || sel.includes('Notiz');
  const showZusammenfassung = showAll || sel.includes('Zusammenfassung Transkript');
  const showAufgaben = showAll || sel.includes('Aufgaben');
  const showAufgabenAbgeschlossen =
    showAll || sel.includes('Aufgaben (abgeschlossen)');
  const showRoutinen = showAll || sel.includes('Routinen');
  const showAffirmationen = showAll || sel.includes('Affirmation');
  const showAnhänge = showAll || sel.includes('Anhänge');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections: any[] = [
    ...(showNotizen ? buildSection('SESSION NOTIZEN', session.notizen) : []),
    ...(showZusammenfassung
      ? buildSection('ZUSAMMENFASSUNG TRANSKRIPT', session.zusammenfassungTranskript)
      : []),
    ...(showAufgaben ? buildSection('AUFGABEN', session.aufgaben) : []),
    ...(showAufgabenAbgeschlossen
      ? buildSection('AUFGABEN (ABGESCHLOSSEN)', session.aufgabenAbgeschlossen)
      : []),
    ...(showRoutinen ? buildSection('ROUTINEN', session.routinen) : []),
    ...(showAffirmationen ? buildSection('AFFIRMATIONEN', session.affirmationen) : []),
    ...(showAnhänge ? buildDocumentsSection(attachments) : []),
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

// ---------- Test helpers (exported for local verification only) ----------
export const __test = { parseInline, parseBlocks };
