const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const TOKEN = process.env.AIRTABLE_TOKEN!;
const TABLE_ID = "tblywrEl1cQbHNzrz"; // 1:1 Sessions
const SPIELER_TABLE = "tblVoY7jSljHw8Dkf";
const COACHES_TABLE = "tbljesKXbMA0Pqa8H";

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

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
  routinen: string | null;
  affirmationen: string | null;
  exportSelection: string[];
}

async function resolveSpielerName(recordId: string): Promise<string> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${SPIELER_TABLE}/${recordId}?fields[]=Vorname&fields[]=Nachname`;
  const res = await fetch(url, { headers });
  if (!res.ok) return "–";
  const { fields } = await res.json();
  return [fields["Vorname"], fields["Nachname"]].filter(Boolean).join(" ") || "–";
}

async function resolveCoachName(recordId: string): Promise<string> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${COACHES_TABLE}/${recordId}?fields[]=${encodeURIComponent("Coach Name")}`;
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
    routinen:
      (f["Routinen (from Spieler)"] as string[] | undefined)?.[0] ?? null,
    affirmationen:
      (f["Affirmationen (from Spieler)"] as string[] | undefined)?.[0] ?? null,
    exportSelection: (f["Export Selection"] as string[] | undefined) ?? [],
  };
}

export async function writeDownloadUrl(
  recordId: string,
  url: string
): Promise<void> {
  const endpoint = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`;
  const res = await fetch(endpoint, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields: { "Download PDF": url } }),
  });

  if (!res.ok) {
    throw new Error(`Airtable write failed: ${res.status} ${await res.text()}`);
  }
}
