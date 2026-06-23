// gen-architektur.mjs
// Scannt fl-pdf-generator und erzeugt ein Architektur-Modell (JSON) fuer die /architektur-Seite.
//
// Bewusst SIMPEL gehalten: kein generisches Adapter-/Plugin-System, sondern die bekannte
// Konvention dieses Repos fest verdrahtet:
//   - Endpoints liegen unter app/api/<name>/route.ts
//   - Integrationen liegen unter lib/<name>.ts und werden ueber den Modulnamen gedeutet (LIB_MEANING)
//   - Lese-/Schreibzugriff wird aus den importierten Funktionsnamen abgeleitet
//
// Wird bei jedem Build ausgefuehrt (siehe package.json "build") -> Diagramm bleibt automatisch aktuell.
// Faellt etwas aus, schreibt das Script ein Fallback-Modell und bricht den Build NICHT ab (exit 0).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(ROOT, 'app', 'api');
const OUT_DIR = path.join(ROOT, 'app', 'architektur');
const OUT_FILE = path.join(OUT_DIR, 'model.generated.json');

// ---- Konvention: lokales lib-Modul -> Bedeutung -------------------------------------------
// kind: 'datasource' (externe Daten) | 'output' (erzeugtes Artefakt) | 'security' (Auth/Token)
const LIB_MEANING = {
  airtable: { kind: 'datasource', label: 'Airtable', detail: 'Session-Daten' },
  'idp-airtable': { kind: 'datasource', label: 'Airtable', detail: 'Scouting-Daten' },
  token: { kind: 'security', label: 'JWT-Token', detail: 'Download-Links signieren & pruefen' },
  'pdf-template': { kind: 'output', label: 'Session-PDF', detail: 'gerendert mit pdfmake' },
  'idp-template': { kind: 'output', label: 'Scouting-PDF (IDP)', detail: 'gerendert mit pdfmake' },
};

// Optionale, gut lesbare Titel pro Endpoint (das einzige Stueck Handarbeit).
// Faellt auf den Pfad zurueck, wenn nichts hinterlegt ist.
const ENDPOINT_TITLE = {
  '/api/webhook': 'Download-Link erzeugen',
  '/api/pdf': 'Session-PDF ausliefern',
  '/api/scouting': 'Scouting-PDF (IDP) erstellen',
};

// Externe Pakete -> Anzeigename (fuer die Tech-Leiste)
const TECH_LABEL = {
  next: 'Next.js',
  pdfmake: 'pdfmake',
  '@react-pdf/renderer': 'react-pdf',
  jose: 'JWT (jose)',
  react: 'React',
};

// ---- Helpers ------------------------------------------------------------------------------
function walk(dir) {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

// Pfad einer route.ts-Datei -> HTTP-Pfad, z.B. app/api/pdf/route.ts -> /api/pdf
function toApiPath(file) {
  const rel = path.relative(API_DIR, path.dirname(file)).split(path.sep).join('/');
  const segs = rel
    .split('/')
    .filter(Boolean)
    .map((s) => s.replace(/^\[(?:\.\.\.)?(.+)\]$/, ':$1')); // [id] -> :id
  return '/api' + (segs.length ? '/' + segs.join('/') : '');
}

// Named imports je Quelle einsammeln: { '@/lib/airtable': ['fetchSession', ...] }
function parseImports(src) {
  const map = {};
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const names = m[1]
      .split(',')
      .map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    const source = m[2];
    (map[source] ||= []).push(...names);
  }
  return map;
}

// Aus importierten Funktionsnamen ableiten, ob gelesen und/oder geschrieben wird.
function classifyAccess(fnNames) {
  let read = false;
  let write = false;
  for (const fn of fnNames) {
    if (/^fetch|^get|^read|^list|^load/i.test(fn)) read = true;
    else if (/append|upload|consume|write|update|create|delete|put|set|sign|patch/i.test(fn)) write = true;
  }
  if (!read && !write) read = true; // Default: mindestens lesend
  return { read, write };
}

function detectTrigger(src) {
  if (/x-webhook-secret/i.test(src)) return 'Airtable Automation (Webhook, Secret-geschuetzt)';
  if (/searchParams\.get\(\s*['"]token['"]\s*\)/.test(src)) return 'Browser-Download (signierter Link)';
  return 'HTTP-Request';
}

function methodsOf(src) {
  const re = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  const set = new Set();
  let m;
  while ((m = re.exec(src)) !== null) set.add(m[1]);
  return [...set];
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

// ---- Build model --------------------------------------------------------------------------
function buildModel() {
  const pkg = readJson(path.join(ROOT, 'package.json')) || {};
  const deps = Object.keys(pkg.dependencies || {});
  const tech = deps.filter((d) => TECH_LABEL[d]).map((d) => TECH_LABEL[d]);

  const routeFiles = walk(API_DIR).filter((f) => /[/\\]route\.(ts|js)$/.test(f));
  routeFiles.sort();

  const endpoints = [];
  const dataSourceSet = new Set();

  for (const file of routeFiles) {
    const apiPath = toApiPath(file);
    // Infrastruktur-Routen (z.B. Auth) gehoeren nicht ins fachliche Diagramm.
    if (apiPath.startsWith('/api/auth')) continue;
    const src = fs.readFileSync(file, 'utf-8');
    const imports = parseImports(src);

    const reads = []; // [{label, detail}]
    const writes = [];
    const outputs = [];
    const security = [];
    const libs = [];

    for (const [source, names] of Object.entries(imports)) {
      const mod = source.startsWith('@/lib/') ? source.slice('@/lib/'.length) : null;
      if (!mod || !LIB_MEANING[mod]) continue;
      const meaning = LIB_MEANING[mod];
      libs.push(mod);
      if (meaning.kind === 'datasource') {
        dataSourceSet.add(meaning.label);
        const { read, write } = classifyAccess(names);
        if (read) reads.push({ label: meaning.label, detail: meaning.detail });
        if (write) writes.push({ label: meaning.label, detail: meaning.detail });
      } else if (meaning.kind === 'output') {
        outputs.push({ label: meaning.label, detail: meaning.detail });
      } else if (meaning.kind === 'security') {
        security.push({ label: meaning.label, detail: meaning.detail });
      }
    }

    // Kurzbeschreibung automatisch zusammensetzen
    const uniq = (arr) => [...new Map(arr.map((x) => [x.label, x])).values()];
    const parts = [];
    if (security.length) parts.push('prueft ' + uniq(security).map((s) => s.label).join(', '));
    if (reads.length) parts.push('liest ' + uniq(reads).map((s) => s.label).join(', '));
    if (writes.length) parts.push('schreibt ' + uniq(writes).map((s) => s.label).join(', '));
    if (outputs.length) parts.push('erstellt ' + uniq(outputs).map((s) => s.label).join(', '));

    endpoints.push({
      method: methodsOf(src).join(' / ') || 'GET',
      path: apiPath,
      title: ENDPOINT_TITLE[apiPath] || apiPath,
      trigger: detectTrigger(src),
      reads: uniq(reads),
      writes: uniq(writes),
      outputs: uniq(outputs),
      security: uniq(security),
      libs: [...new Set(libs)],
      description: parts.join(' · ') || 'HTTP-Endpoint',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    service: {
      name: pkg.name || 'fl-pdf-generator',
      version: pkg.version || '0.0.0',
      framework: 'Next.js',
    },
    endpoints,
    dataSources: [...dataSourceSet],
    tech,
  };
}

// ---- Run ----------------------------------------------------------------------------------
function main() {
  let model;
  try {
    model = buildModel();
    if (!model.endpoints.length) {
      console.warn('[gen-architektur] Keine Endpoints gefunden - schreibe trotzdem (leeres) Modell.');
    }
  } catch (err) {
    console.error('[gen-architektur] Scan fehlgeschlagen, schreibe Fallback-Modell:', err);
    model = {
      generatedAt: new Date().toISOString(),
      service: { name: 'fl-pdf-generator', version: '0.0.0', framework: 'Next.js' },
      endpoints: [],
      dataSources: [],
      tech: [],
      error: String(err),
    };
  }

  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(model, null, 2) + '\n', 'utf-8');
    console.log(
      `[gen-architektur] ${model.endpoints.length} Endpoint(s) -> ${path.relative(ROOT, OUT_FILE)}`
    );
  } catch (err) {
    // Selbst Schreibfehler darf den Build nicht abbrechen.
    console.error('[gen-architektur] Konnte Modell nicht schreiben:', err);
  }
}

main();
