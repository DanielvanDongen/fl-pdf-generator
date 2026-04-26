import { SignJWT, jwtVerify } from "jose";
import type { SessionRecord } from "./airtable";

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function signDownloadToken(session: SessionRecord): Promise<string> {
  return new SignJWT({ session })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .setIssuedAt()
    .sign(secret);
}

export async function verifyDownloadToken(
  token: string
): Promise<{ session: SessionRecord }> {
  const { payload } = await jwtVerify(token, secret);
  return { session: payload.session as SessionRecord };
}
