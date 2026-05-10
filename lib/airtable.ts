const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const TOKEN = process.env.AIRTABLE_TOKEN!;
const TABLE_ID = "tblywrEl1cQbHNzrz"; // 1:1 Sessions
const SPIELER_TABLE = "tblVoY7jSljHw8Dkf";
const COACHES_TABLE = "tbljesKXbMA0Pqa8H";

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

export interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
}

export interface SessionRecord {
  id: string;
  datum: string;
  sessionTyp: string;
  spielerName: string;
  coachName: string;
  dauer: number | null;
  medium: string | null;
  notizen: string | null;
  toDos: string | null;
  toDosAbgeschlossen: string | null;
  routinen: string | null;
  affirmationen: string | null;
  zusammenfassungTranskript: string | null;
  exportSelection: string[];
  anhänge: AirtableAttachment[] | null;
}

async function resolveSpielerName(recordId: string): Promise<string> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${SPIELER_TABLE}/${recordId}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return "–";
  const { fields } = await res.json();
  return [fields["Vorname"], fields["Nachname"]].filter(Boolean).join(" ") || "–";
}

async function resolveCoachName(recordId: string): Promise<string> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${COACHES_TABLE}/${recordId}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return "–";
  const { fields } = await res.json();
  return fields["Coach Name"] ?? "–";
}

export async function fetchSession(recordId: string): Promise<SessionRecord> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error(`Airtable fetch failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const f = data.fields;

  const spielerRecordId = (f["Spieler"] as string[] | undefined)?.[0] ?? null;
  const coachRecordId = (f["Coach"] as string[] | undefined)?.[0] ?? null;

  const [spielerName, coachName] = await Promise.all([
    spielerRecordId ? resolveSpielerName(spielerRecordId) : Promise.resolve("–"),
    coachRecordId ? resolveCoachName(coachRecordId) : Promise.resolve("–"),
  ]);

  return {
    id: data.id,
    datum: f["Datum"] ?? "",
    sessionTyp: f["Session-Typ"] ?? "",
    spielerName,
    coachName,
    dauer: f["Dauer (Minuten)"] ?? null,
    medium: f["Medium"] ?? null,
    notizen: f["Notizen"] ?? null,
    toDos: (f["To Dos (from Spieler)"] as string[] | undefined)?.[0] ?? null,
    toDosAbgeschlossen:
      (f["To Dos (abgeschlossen)"] as string[] | undefined)?.[0] ?? null,
    routinen:
      (f["Routinen (from Spieler)"] as string[] | undefined)?.[0] ?? null,
    affirmationen:
      (f["Affirmationen (from Spieler)"] as string[] | undefined)?.[0] ?? null,
    zusammenfassungTranskript: f["Zusammenfassung Transkript"] ?? null,
    exportSelection: (f["Export Selection"] as string[] | undefined) ?? [],
    anhänge: (f["Anhänge"] as AirtableAttachment[] | undefined) ?? null,
  };
}

const MAX_ACTIVE_JTIS = 10;

function parseJtiList(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-f0-9]{32}$/.test(s));
}

async function readJtiList(recordId: string): Promise<string[]> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return parseJtiList(data.fields?.["Token JTI"]);
}

async function writeJtiList(
  recordId: string,
  list: string[],
  extra: Record<string, string> = {}
): Promise<void> {
  const endpoint = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`;
  const res = await fetch(endpoint, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      fields: { "Token JTI": list.join(","), ...extra },
    }),
  });
  if (!res.ok) {
    throw new Error(`Airtable write failed: ${res.status} ${await res.text()}`);
  }
}

export async function appendJtiAndWriteUrl(
  recordId: string,
  url: string,
  jti: string
): Promise<void> {
  const current = await readJtiList(recordId);
  const next = [...current, jti].slice(-MAX_ACTIVE_JTIS);
  await writeJtiList(recordId, next, { "Download PDF": url });
}

export async function consumeJti(
  recordId: string,
  jti: string
): Promise<boolean> {
  const current = await readJtiList(recordId);
  if (!current.includes(jti)) return false;
  const next = current.filter((j) => j !== jti);
  await writeJtiList(recordId, next);
  return true;
}
