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
  fetchScoutingAuftrag,
  resolveAuftragFromSession,
  writeAuftragContent,
  uploadIdpAttachment,
  uploadIdpToAuftrag,
  SCOUTING_SESSION_TYP,
  type PlayerMeta,
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

type PillarBundle = Pick<IdpData, 'spiele' | 'physis' | 'technik' | 'taktik' | 'mental'>;

// Merges player meta (with optional payload overrides) and pillar content into IdpData.
function buildIdpData(m: PlayerMeta, content: PillarBundle, body: Record<string, unknown>): IdpData {
  const override = (key: string, fallback: string): string => {
    const v = body[key];
    return typeof v === 'string' && v.trim() ? v : fallback;
  };
  return {
    name: override('name', m.name),
    position: override('position', m.position),
    geburtsdatum: override('geburtsdatum', m.geburtsdatum),
    liga: override('liga', m.liga),
    ...content,
  };
}

function idpFilename(m: PlayerMeta): string {
  const nachname = sanitizeFilenamePart((m.nachname || m.name).toUpperCase());
  const vorname = sanitizeFilenamePart(m.vorname);
  return `IDP_${[nachname, vorname].filter(Boolean).join('-') || 'Scouting'}.pdf`;
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

  const REC_RE = /^rec[A-Za-z0-9]{14}$/;

  // sessionId: the source 1:1 session (automatic transcript flow) — used to
  // resolve and link the Auftrag.
  const sessionId =
    typeof body?.sessionId === 'string' && REC_RE.test(body.sessionId) ? body.sessionId : '';

  // ---- Auftrag path: 4-Säulen-Inhalt lebt am Scouting-Auftrag (Option 1) ----
  let auftragId =
    typeof body?.auftragId === 'string' && REC_RE.test(body.auftragId) ? body.auftragId : '';

  // Automatic flow: no explicit auftragId, but a source session → resolve the
  // player's (open) Scouting-Auftrag from it.
  if (!auftragId && sessionId) {
    try {
      const resolved = await resolveAuftragFromSession(sessionId);
      if (!resolved) {
        return NextResponse.json(
          { error: 'Kein Scouting-Auftrag für diese Session gefunden' },
          { status: 404 }
        );
      }
      auftragId = resolved;
    } catch (err) {
      console.error('resolveAuftragFromSession error:', err);
      return NextResponse.json({ error: 'Auftrag-Auflösung fehlgeschlagen' }, { status: 500 });
    }
  }

  if (auftragId) {
    let auftrag;
    try {
      auftrag = await fetchScoutingAuftrag(auftragId);
    } catch (err) {
      console.error('Scouting Auftrag fetch error:', err);
      return NextResponse.json({ error: 'Auftrag not found' }, { status: 404 });
    }

    // Two modes:
    //  - Payload carries pillar content (automatic transcript flow): write it into
    //    the editable Auftrag fields (+ optional session link), then render from it.
    //  - No payload content (manual "IDP generieren" button): render from the
    //    fields already on the Auftrag.
    const hasPayloadContent =
      body.physis || body.technik || body.taktik || body.mental || body.spiele;

    let pillars: PillarBundle;
    if (hasPayloadContent) {
      pillars = {
        spiele: asStringArray(body.spiele),
        physis: asPillar(body.physis),
        technik: asPillar(body.technik),
        taktik: asPillar(body.taktik),
        mental: asPillar(body.mental),
      };
      try {
        await writeAuftragContent(auftragId, pillars, sessionId || undefined);
      } catch (err) {
        console.error('Auftrag content write error:', err);
        return NextResponse.json({ error: 'Auftrag-Felder schreiben fehlgeschlagen' }, { status: 500 });
      }
    } else {
      pillars = auftrag.pillars;
    }

    const data = buildIdpData(auftrag.player, pillars, body);

    let pdf: Buffer;
    try {
      pdf = await generateIdpBuffer(data, loadAssets());
    } catch (err) {
      console.error('IDP generation error:', err instanceof Error ? err.stack : err);
      return NextResponse.json({ error: 'PDF-Generierung fehlgeschlagen' }, { status: 500 });
    }

    const filename = idpFilename(auftrag.player);
    try {
      await uploadIdpToAuftrag(auftragId, pdf, filename);
    } catch (err) {
      console.error('IDP attachment upload error (Auftrag):', err);
      return NextResponse.json({ error: 'Upload nach Airtable fehlgeschlagen' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      source: hasPayloadContent ? 'auftrag+write' : 'auftrag',
      filename,
      bytes: pdf.length,
    });
  }

  // ---- Session path (Legacy): recordId = 1:1-Session, Inhalt aus dem Payload ----
  const recordId = body?.recordId;
  if (typeof recordId !== 'string' || !REC_RE.test(recordId)) {
    return NextResponse.json({ error: 'Invalid recordId (oder auftragId)' }, { status: 400 });
  }

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

  const data = buildIdpData(
    session.player,
    {
      spiele: asStringArray(body.spiele),
      physis: asPillar(body.physis),
      technik: asPillar(body.technik),
      taktik: asPillar(body.taktik),
      mental: asPillar(body.mental),
    },
    body
  );

  let pdf: Buffer;
  try {
    pdf = await generateIdpBuffer(data, loadAssets());
  } catch (err) {
    console.error('IDP generation error:', err instanceof Error ? err.stack : err);
    return NextResponse.json({ error: 'PDF-Generierung fehlgeschlagen' }, { status: 500 });
  }

  const filename = idpFilename(session.player);
  try {
    await uploadIdpAttachment(recordId, pdf, filename);
  } catch (err) {
    console.error('IDP attachment upload error:', err);
    return NextResponse.json({ error: 'Upload nach Airtable fehlgeschlagen' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, filename, bytes: pdf.length });
}
