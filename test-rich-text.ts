import { generatePdfBuffer, __test, type AttachmentImage } from './lib/pdf-template';
import type { SessionRecord } from './lib/airtable';
import * as fs from 'fs';
import * as path from 'path';

const { parseInline, parseBlocks } = __test;

// ------------- Inline parser unit checks -------------
type Run = { text: string; bold?: boolean; italics?: boolean; decoration?: string; link?: string; font?: string };

function runHasBold(runs: Run[], substring: string): boolean {
  return runs.some((r) => r.bold === true && r.text.includes(substring));
}
function runHasItalic(runs: Run[], substring: string): boolean {
  return runs.some((r) => r.italics === true && r.text.includes(substring));
}
function runHasStrike(runs: Run[], substring: string): boolean {
  return runs.some((r) => r.decoration === 'lineThrough' && r.text.includes(substring));
}
function runHasLink(runs: Run[], label: string, url: string): boolean {
  return runs.some((r) => r.text === label && r.link === url);
}
function runHasCode(runs: Run[], text: string): boolean {
  return runs.some((r) => r.font === 'Courier' && r.text === text);
}

const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (!cond) failures.push('FAIL: ' + msg);
  else console.log('  ✓ ' + msg);
}

console.log('Inline parser:');
{
  const r = parseInline('plain **bold** text') as Run[];
  assert(runHasBold(r, 'bold'), 'bold ** **');
}
{
  const r = parseInline('plain __bold__ text') as Run[];
  assert(runHasBold(r, 'bold'), 'bold __ __');
}
{
  const r = parseInline('text *italic* text') as Run[];
  assert(runHasItalic(r, 'italic'), 'italic * *');
}
{
  const r = parseInline('text _italic_ text') as Run[];
  assert(runHasItalic(r, 'italic'), 'italic _ _');
}
{
  const r = parseInline('text ~~struck~~ text') as Run[];
  assert(runHasStrike(r, 'struck'), 'strikethrough ~~');
}
{
  const r = parseInline('text ***bolditalic*** text') as Run[];
  assert(
    r.some((x) => x.bold && x.italics && x.text === 'bolditalic'),
    'combined ***bold italic***'
  );
}
{
  const r = parseInline('a **bold _and italic_ inside** b') as Run[];
  assert(runHasBold(r, 'bold '), 'nested: outer bold preserved');
  assert(r.some((x) => x.bold && x.italics && x.text.includes('and italic')), 'nested: inner italic inherits bold');
}
{
  const r = parseInline('see [docs](https://example.com/x) here') as Run[];
  assert(runHasLink(r, 'docs', 'https://example.com/x'), 'link [text](url)');
}
{
  const r = parseInline('use `printf` for output') as Run[];
  assert(runHasCode(r, 'printf'), 'inline code');
}
{
  const r = parseInline('a **bold *italic* end** z') as Run[];
  assert(r.some((x) => x.bold && x.italics && x.text === 'italic'), 'nested italic inside bold');
  assert(r.some((x) => x.bold && !x.italics && x.text.includes('bold ')), 'bold prefix preserved');
  assert(r.some((x) => x.bold && !x.italics && x.text.includes(' end')), 'bold suffix preserved');
}

// ------------- Block parser unit checks -------------
console.log('\nBlock parser:');
{
  const b = parseBlocks('# Heading 1\n\nPara text');
  assert(b[0].kind === 'heading' && (b[0] as any).level === 1, 'heading level 1');
  assert(b[1].kind === 'paragraph', 'paragraph after heading');
}
{
  const b = parseBlocks('- one\n- two\n- three');
  assert(b[0].kind === 'ul' && (b[0] as any).items.length === 3, 'ul 3 items');
}
{
  const b = parseBlocks('1. one\n2. two');
  assert(b[0].kind === 'ol' && (b[0] as any).items.length === 2, 'ol 2 items');
}
{
  const b = parseBlocks('- outer\n  - inner1\n  - inner2\n- outer2');
  const ul = b[0] as any;
  assert(ul.kind === 'ul' && ul.items.length === 2, 'nested ul: 2 outer items');
  assert(ul.items[0].children?.items.length === 2, 'nested ul: 2 inner items under first');
  assert(ul.items[0].children?.ordered === false, 'nested ul: inner is unordered');
}
{
  const b = parseBlocks('1. a\n   1. sub-a\n   2. sub-b\n2. b');
  const ol = b[0] as any;
  assert(ol.kind === 'ol' && ol.items.length === 2, 'nested ol: 2 outer');
  assert(ol.items[0].children?.items.length === 2, 'nested ol: 2 inner');
  assert(ol.items[0].children?.ordered === true, 'nested ol: inner is ordered');
}
{
  const b = parseBlocks('> quote line one\n> quote line two\n\npara');
  assert(b[0].kind === 'blockquote', 'blockquote detected');
  assert((b[0] as any).text.includes('quote line one'), 'blockquote content');
  assert(b[1].kind === 'paragraph', 'paragraph after blockquote');
}
{
  const b = parseBlocks('```\nconst x = 1;\nconst y = 2;\n```');
  assert(b[0].kind === 'codeblock', 'code block detected');
  assert((b[0] as any).text.includes('const x'), 'code block content');
}
{
  const b = parseBlocks('above\n\n---\n\nbelow');
  assert(b[1].kind === 'hr', 'horizontal rule detected');
}
{
  const b = parseBlocks('[ ] task one\n[x] task two\n[ ] task three');
  assert(b[0].kind === 'ul' && (b[0] as any).items.length === 3, 'task list (3 items)');
}

// ------------- Generate sample PDF -------------
console.log('\nGenerating sample PDF…');

const session: SessionRecord = {
  id: 'rec_test',
  datum: '2026-05-15',
  sessionTyp: 'Test Session',
  spielerName: 'Test Spieler',
  coachName: 'Test Coach',
  dauer: 60,
  medium: 'Zoom',
  notizen: `# Hauptthema heute

**Wichtige** Punkte aus der Session:

- Erstens, **fett markiert** für Klarheit
- Zweitens mit *Kursivschrift* für Betonung
- Drittens mit ~~Durchstreichung~~ für entfernte Punkte
- Vierter Punkt mit ***fett und kursiv*** Mischung
- Fünfter Punkt mit \`inline code\` Element

## Unterthema

Ein **fett-Absatz mit _kursivem_ Innenbereich** zeigt verschachtelte Formatierung.
Außerdem ein [Beispiel-Link](https://example.com/ressource) zur weiteren Lektüre.

### Verschachtelte Liste

- Hauptpunkt A
  - Unterpunkt A.1
  - Unterpunkt A.2 mit **fett** drin
- Hauptpunkt B

### Nummerierte Liste

1. Erster Schritt
2. Zweiter Schritt
   1. Detail 2.1
   2. Detail 2.2
3. Dritter Schritt

### Zitat

> Dies ist ein wichtiges Zitat vom Coach.
> Zweite Zeile des Zitats mit **fettem** Inhalt.

### Code Beispiel

\`\`\`
function example() {
  return "Hello";
}
\`\`\`

---

Letzter Absatz mit **abschließenden** Gedanken.`,
  toDos: `- [ ] Offene Aufgabe mit **fettem** Text
- [x] Erledigte Aufgabe
- [ ] Aufgabe mit *Kursiv* und [Link](https://example.com/aufgabe)`,
  toDosAbgeschlossen: `[x] Alles erledigt
[x] Bestätigt durch **Coach**`,
  routinen: `Tägliche Routine:

1. **Aufwärmen** (10 Minuten)
2. *Stretching* (5 Minuten)
3. Hauptübung

> Wichtig: ~~Keine Pausen~~ Pausen sind erlaubt nach Bedarf.`,
  affirmationen: `# Affirmationen

- Ich bin **stark** und *fokussiert*.
- Jeden Tag werde ich ***besser***.
- Mein Ziel: [Ziel-Dokument](https://example.com/ziel)`,
  zusammenfassungTranskript: `**Zusammenfassung** der heutigen Session.

Hauptthemen:
- Mentale Stärke
- ~~Alte Gewohnheiten~~ ablegen
- Neue Routinen einführen

Siehe \`config.json\` für Details.`,
  exportSelection: [],
  anhänge: null,
};

(async () => {
  const logoPath = path.join(process.cwd(), 'public', 'logo.png');
  const logoDataUrl = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
  const attachments: AttachmentImage[] = [];

  const buf = await generatePdfBuffer(session, logoDataUrl, attachments);
  const out = path.join(process.cwd(), 'test-rich-text.pdf');
  fs.writeFileSync(out, buf);
  console.log(`  ✓ Wrote ${out} (${buf.length} bytes)`);

  if (failures.length) {
    console.error('\n=== FAILURES ===');
    failures.forEach((f) => console.error(f));
    process.exit(1);
  } else {
    console.log('\nAll parser assertions passed.');
  }
})().catch((err) => {
  console.error('PDF generation failed:', err);
  process.exit(1);
});
