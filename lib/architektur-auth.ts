// Einfacher Passwort-Schutz fuer /architektur.
// Ein gemeinsames Passwort (ENV ARCHITEKTUR_PASSWORD) -> nach Eingabe wird ein signiertes,
// httpOnly-Cookie gesetzt. Signaturschluessel = SHA-256 des Passworts (kein zweites Secret noetig;
// aendert sich das Passwort, werden alte Cookies automatisch ungueltig).
import { SignJWT, jwtVerify } from 'jose';
import { createHash } from 'crypto';

export const ARCH_COOKIE = 'fl_arch';
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 Tage

function signingKey(): Uint8Array | null {
  const pw = process.env.ARCHITEKTUR_PASSWORD;
  if (!pw) return null;
  return new Uint8Array(createHash('sha256').update(pw).digest());
}

export function isConfigured(): boolean {
  return !!process.env.ARCHITEKTUR_PASSWORD;
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ARCHITEKTUR_PASSWORD ?? '';
  // Laengen-stabiler Vergleich
  if (!expected || input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(): Promise<string> {
  const key = signingKey();
  if (!key) throw new Error('ARCHITEKTUR_PASSWORD ist nicht gesetzt');
  return new SignJWT({ s: 'arch' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(key);
}

export async function verifySessionToken(token?: string): Promise<boolean> {
  const key = signingKey();
  if (!key || !token) return false;
  try {
    await jwtVerify(token, key);
    return true;
  } catch {
    return false;
  }
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/architektur',
  maxAge: MAX_AGE_S,
};
