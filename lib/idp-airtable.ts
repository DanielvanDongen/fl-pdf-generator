// Airtable helpers for the Scouting-Analyse IDP flow.
// Kept separate from lib/airtable.ts so the session-protocol flow is untouched.

const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const TOKEN = process.env.AIRTABLE_TOKEN!;

const SESSIONS_TABLE = 'tblywrEl1cQbHNzrz'; // 1:1 Sessions
const SPIELER_TABLE = 'tblVoY7jSljHw8Dkf';
const ANHAENGE_FIELD = 'fldstRa8ZE9ljAl2y'; // 1:1 Sessions → Anhänge (multipleAttachments)

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

// Uploads a PDF into the session's Anhänge field via the Airtable content API.
// Note: appends (does not replace existing attachments).
export async function uploadIdpAttachment(
  recordId: string,
  pdf: Buffer,
  filename: string
): Promise<void> {
  const endpoint = `https://content.airtable.com/v0/${BASE_ID}/${recordId}/${ANHAENGE_FIELD}/uploadAttachment`;
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
