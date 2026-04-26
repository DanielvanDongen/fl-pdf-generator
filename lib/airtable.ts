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
