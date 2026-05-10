import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "crypto";

let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters");
  }
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

export interface DownloadTokenPayload {
  recordId: string;
  jti: string;
}

export function generateJti(): string {
  return randomBytes(16).toString("hex");
}

export async function signDownloadToken(
  recordId: string,
  jti: string
): Promise<string> {
  return new SignJWT({ recordId })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setExpirationTime("5m")
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyDownloadToken(
  token: string
): Promise<DownloadTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ["HS256"],
  });
  if (typeof payload.recordId !== "string" || typeof payload.jti !== "string") {
    throw new Error("Invalid token payload");
  }
  return { recordId: payload.recordId, jti: payload.jti };
}
