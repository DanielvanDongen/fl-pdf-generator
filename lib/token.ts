import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function signDownloadToken(recordId: string): Promise<string> {
  return new SignJWT({ recordId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .setIssuedAt()
    .sign(secret);
}

export async function verifyDownloadToken(
  token: string
): Promise<{ recordId: string }> {
  const { payload } = await jwtVerify(token, secret);
  return { recordId: payload.recordId as string };
}
