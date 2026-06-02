import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import path from 'path';
import fs from 'fs';
import {
  generateIdpBuffer,
  type IdpData,
  type IdpAssets,
  type PillarContent,
  type PillarKey,
} from '@/lib/idp-template';
import {
  fetchScoutingSession,
  uploadIdpAttachment,
  SCOUTING_SESSION_TYP,
} from '@/lib/idp-airtable';

export const runtime = 'nodejs';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// ---- Asset loading (cached per warm instance) ----
let cachedAssets: IdpAssets | null = null;
function loadAssets(): IdpAssets {
  if (cachedAssets) return cachedAssets;
  const dir = path.join(process.cwd(), 'public', 'idp');
  const toUrl = (file: string) =>
    `data:image/png;base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}`;
  cachedAssets = {
    logoDataUrl: toUrl('tl-logo.png'),
    iconDataUrls: {
      physis: toUrl('icon-physis.png'),
      technik: toUrl('icon-technik.png'),
      taktik: toUrl('icon-taktik.png'),
      mental: toUrl('icon-mental.png'),
    } as Record<PillarKey, string>,
  };
  return cachedAssets;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function asPillar(v: unknown): PillarContent {
  const o = (v ?? {}) as Record<string, unknown>;
  return { staerken: asStringArray(o.staerken), entwicklung: asStringArray(o.entwicklung) };
}

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[^A-Za-z0-9äöüÄÖÜß_-]/g, '_').slice(0, 60);
}

export async function POST(req: NextRequest) {
  // 1) Auth (same shared secret as the session webhook)
  const provided = req.headers.get('x-webhook-secret') ?? '';
  const expected = process.env.WEBHOOK_SECRET ?? '';
  if (!expected || !safeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2) Parse + validate payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const recordId = body?.recordId;
  if (typeof recordId !== 'string' || !/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
    return NextResponse.json({ error: 'Invalid recordId' }, { status: 400 });
  }

  // 3) Fetch session + player meta; guard session type
  let session;
  try {
    session = await fetchScoutingSession(recordId);
  } catch (err) {
    console.error('Scouting session fetch error:', err);
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }
  if (session.sessionTyp !== SCOUTING_SESSION_TYP) {
    return NextResponse.json(
      { error: `Session-Typ ist "${session.sessionTyp}", erwartet "${SCOUTING_SESSION_TYP}"` },
      { status: 422 }
    );
  }

  // 4) Build IDP data: Airtable meta + optional payload overrides + pillar content from payload
  const m = session.player;
  const data: IdpData = {
    name: typeof body.name === 'string' && body.name.trim() ? body.name : m.name,
    position: typeof body.position === 'string' && body.position.trim() ? body.position : m.position,
    geburtsdatum:
      typeof body.geburtsdatum === 'string' && body.geburtsdatum.trim()
        ? body.geburtsdatum
        : m.geburtsdatum,
    liga: typeof body.liga === 'string' && body.liga.trim() ? body.liga : m.liga,
    spiele: asStringArray(body.spiele),
    physis: asPillar(body.physis),
    technik: asPillar(body.technik),
    taktik: asPillar(body.taktik),
    mental: asPillar(body.mental),
  };

  // 5) Render PDF
  let pdf: Buffer;
  try {
    pdf = await generateIdpBuffer(data, loadAssets());
  } catch (err) {
    console.error('IDP generation error:', err instanceof Error ? err.stack : err);
    return NextResponse.json({ error: 'PDF-Generierung fehlgeschlagen' }, { status: 500 });
  }

  // 6) Upload to Anhänge
  const nachname = sanitizeFilenamePart((m.nachname || m.name).toUpperCase());
  const vorname = sanitizeFilenamePart(m.vorname);
  const filename = `IDP_${[nachname, vorname].filter(Boolean).join('-') || 'Scouting'}.pdf`;
  try {
    await uploadIdpAttachment(recordId, pdf, filename);
  } catch (err) {
    console.error('IDP attachment upload error:', err);
    return NextResponse.json({ error: 'Upload nach Airtable fehlgeschlagen' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, filename, bytes: pdf.length });
}
