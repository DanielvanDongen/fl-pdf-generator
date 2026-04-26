const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const TOKEN = process.env.AIRTABLE_TOKEN!;
const TABLE_ID = "tblywrEl1cQbHNzrz"; // 1:1 Sessions

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

export async function fetchSession(recordId: string): Promise<SessionRecord> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error(`Airtable fetch failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const f = data.fields;

  const spielerRaw = f["Spieler"] as string[] | undefined;
  const coachRaw = f["Coach"] as string[] | undefined;

  return {
    id: data.id,
    datum: f["Datum"] ?? "",
    sessionTyp: f["Session-Typ"] ?? "",
    spielerName: spielerRaw?.[0] ?? "–",
    coachName: coachRaw?.[0] ?? "–",
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
