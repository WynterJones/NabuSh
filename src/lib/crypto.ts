import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/**
 * Secret handling for a self-hosted instance. Everything here uses Node's
 * built-in crypto rather than bcrypt/argon2 bindings — a pure-JS dependency
 * tree keeps the Docker image buildable on any architecture without native
 * compilation, which matters when the image has to run on whatever Railway
 * schedules it onto.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = process.env.NABU_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "NABU_SECRET must be set to a random string of at least 16 characters. " +
        "The Railway template generates this for you; set it manually for local dev.",
    );
  }

  // Fixed salt: the derived key must be stable across restarts or every stored
  // secret becomes undecryptable. NABU_SECRET itself carries the entropy.
  cachedKey = scryptSync(secret, "nabu-instance-salt", 32);
  return cachedKey;
}

/** Encrypts a value for storage. Output is `iv.tag.ciphertext`, all base64url. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decrypt(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Malformed ciphertext");
  }

  const tag = Buffer.from(tagPart, "base64url");
  if (tag.length !== TAG_LENGTH) throw new Error("Malformed auth tag");

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Hashes a password as `salt:hash`, both hex. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Shows enough of a secret to recognise it without revealing it. */
export function maskSecret(secret: string): string {
  if (secret.length <= 12) return "••••••••";
  return `${secret.slice(0, 6)}••••••••${secret.slice(-4)}`;
}
