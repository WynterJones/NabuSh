import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "./crypto";

const COOKIE_NAME = "nabu_session";
const SESSION_DAYS = 30;

function sessionSecret(): Uint8Array {
  const secret = process.env.NABU_SECRET;
  if (!secret) throw new Error("NABU_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    // Self-hosters may run behind plain HTTP on a LAN; forcing Secure there
    // would silently drop the cookie and make login appear broken.
    secure: process.env.NODE_ENV === "production" && process.env.NABU_ALLOW_HTTP !== "true",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (!payload.sub) return null;

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    return user ?? null;
  } catch {
    return null;
  }
}

export async function authenticate(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return user;
}

/** True before the first account exists, which routes the app to /setup. */
export async function needsSetup(): Promise<boolean> {
  const [existing] = await db.select({ id: users.id }).from(users).limit(1);
  return !existing;
}
