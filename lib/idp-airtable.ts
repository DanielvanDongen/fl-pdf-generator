// Airtable helpers for the Scouting-Analyse IDP flow.
// Kept separate from lib/airtable.ts so the session-protocol flow is untouched.

const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const TOKEN = process.env.AIRTABLE_TOKEN!;

const SESSIONS_TABLE = 'tblywrEl1cQbHNzrz'; // 1:1 Sessions
const SPIELER_TABLE = 'tblVoY7jSljHw8Dkf';
const ANHAENGE_FIELD = 'fldstRa8ZE9ljAl2y'; // 1:1 Sessions → Anhänge (multipleAttachments)
const AUFTRAEGE_TABLE = 'tblma9xZ6o8RvqEMC'; // Scouting-Aufträge
const AUFTRAG_IDP_PDF_FIELD = 'fldLrDrKB8gVnBUYL'; // Scouting-Aufträge → IDP-PDF (multipleAttachments)

export const SCOUTING_SESSION_TYP = 'Scouting Analyse';

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

export interface PlayerMeta {
  name: string;
  vorname: string;
  nachname: string;
  position: string;
  geburtsdatum: string; // ISO (YYYY-MM-DD) as stored
  liga: string;
}

export interface ScoutingSession {
  recordId: string;
  sessionTyp: string;
  hasTranskript: boolean;
  player: PlayerMeta;
}

interface Pillar {
  staerken: string[];
  entwicklung: string[];
}

export interface AuftragPillars {
  spiele: string[];
  physis: Pillar;
  technik: Pillar;
  taktik: Pillar;
  mental: Pillar;
}

export interface ScoutingAuftrag {
  recordId: string;
  player: PlayerMeta;
  pillars: AuftragPillars;
}

function firstString(v: unknown): string {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join(', ');
  return typeof v === 'string' ? v : '';
}

function richTextNonEmpty(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

async function fetchSpieler(recordId: string): Promise<PlayerMeta> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${SPIELER_TABLE}/${recordId}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Spieler fetch failed: ${res.status} ${await res.text()}`);
  }
  const { fields } = await res.json();
  const vorname = firstString(fields['Vorname']);
  const nachname = firstString(fields['Nachname']);
  const ligaName = firstString(fields['Liga Name']);
  const land = firstString(fields['Land']);
  const liga = ligaName && land ? `${ligaName} (${land})` : ligaName || land;

  return {
    name: firstString(fields['Vollständiger Name']) || [nachname, vorname].filter(Boolean).join(' '),
    vorname,
    nachname,
    position: firstString(fields['Position(en)']),
    geburtsdatum: firstString(fields['Geburtsdatum']),
    liga,
  };
}

export async function fetchScoutingSession(recordId: string): Promise<ScoutingSession> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${SESSIONS_TABLE}/${recordId}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Session fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const f = data.fields ?? {};
  const spielerId = (f['Spieler'] as string[] | undefined)?.[0] ?? null;
  const player = spielerId
    ? await fetchSpieler(spielerId)
    : { name: '', vorname: '', nachname: '', position: '', geburtsdatum: '', liga: '' };

  return {
    recordId: data.id,
    sessionTyp: f['Session-Typ'] ?? '',
    hasTranskript: richTextNonEmpty(f['Transkript']),
    player,
  };
}

// Splits a multiline text field into trimmed, non-empty bullet lines.
// Strips a leading bullet/dash so coaches can write "• …" or "- …" freely.
function splitLines(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  return v
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s••\-*]+/, '').trim())
    .filter((l) => l.length > 0);
}

// Reads the 4-Säulen IDP content directly from a Scouting-Auftrag record
// (Option 1: content lives on the order, not the session).
export async function fetchScoutingAuftrag(recordId: string): Promise<ScoutingAuftrag> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${AUFTRAEGE_TABLE}/${recordId}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Auftrag fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const f = data.fields ?? {};
  const spielerId = (f['Spieler'] as string[] | undefined)?.[0] ?? null;
  const player = spielerId
    ? await fetchSpieler(spielerId)
    : { name: '', vorname: '', nachname: '', position: '', geburtsdatum: '', liga: '' };

  return {
    recordId: data.id,
    player,
    pillars: {
      spiele: splitLines(f['Beobachtete Spiele']),
      physis: {
        staerken: splitLines(f['Physis - Stärken']),
        entwicklung: splitLines(f['Physis - Entwicklungsfelder']),
      },
      technik: {
        staerken: splitLines(f['Technik - Stärken']),
        entwicklung: splitLines(f['Technik - Entwicklungsfelder']),
      },
      taktik: {
        staerken: splitLines(f['Taktik - Stärken']),
        entwicklung: splitLines(f['Taktik - Entwicklungsfelder']),
      },
      mental: {
        staerken: splitLines(f['Mental - Stärken']),
        entwicklung: splitLines(f['Mental - Entwicklungsfelder']),
      },
    },
  };
}

// Appends a PDF into an attachment field via the Airtable content API.
async function uploadAttachmentToField(
  recordId: string,
  fieldId: string,
  pdf: Buffer,
  filename: string
): Promise<void> {
  const endpoint = `https://content.airtable.com/v0/${BASE_ID}/${recordId}/${fieldId}/uploadAttachment`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contentType: 'application/pdf',
      filename,
      file: pdf.toString('base64'),
    }),
  });
  if (!res.ok) {
    throw new Error(`Attachment upload failed: ${res.status} ${await res.text()}`);
  }
}

// Session flow: append the IDP into the session's Anhänge field (does not replace).
export async function uploadIdpAttachment(
  recordId: string,
  pdf: Buffer,
  filename: string
): Promise<void> {
  await uploadAttachmentToField(recordId, ANHAENGE_FIELD, pdf, filename);
}

// Auftrag flow: replace the IDP-PDF field so re-generation yields a single current PDF.
// Clear first, then upload the fresh buffer (PDF is always re-derivable from the fields).
export async function uploadIdpToAuftrag(
  recordId: string,
  pdf: Buffer,
  filename: string
): Promise<void> {
  const patchUrl = `https://api.airtable.com/v0/${BASE_ID}/${AUFTRAEGE_TABLE}/${recordId}`;
  const clear = await fetch(patchUrl, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { [AUFTRAG_IDP_PDF_FIELD]: [] } }),
  });
  if (!clear.ok) {
    throw new Error(`IDP-PDF clear failed: ${clear.status} ${await clear.text()}`);
  }
  await uploadAttachmentToField(recordId, AUFTRAG_IDP_PDF_FIELD, pdf, filename);
}
