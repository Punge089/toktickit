import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

// Issue 63 — password hashing and policy (docs/lab-03/specification.md
// BR-07, BR-08, BR-09; api-spec.md §0/§4). scrypt is used from Node's
// built-in crypto module rather than bcrypt/argon2 specifically to avoid a
// native-addon dependency that needs a matching prebuilt binary per
// OS/Node version (this project is developed on Windows and graded
// elsewhere) — see specification.md §11 Assumptions.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// A small hand-rolled Promise wrapper instead of util.promisify(scrypt):
// scrypt's options-object overload doesn't resolve cleanly through
// promisify's overload matching, so this is more reliable than fighting
// the type inference.
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

// Stored format: scrypt$N$r$p$<saltBase64>$<hashBase64> — every hashing
// parameter travels with the hash, so a future change to N/r/p never
// breaks verifying an older hash.
export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scryptAsync(plainPassword, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${derivedKey.toString("base64")}`;
}

// A fixed, never-matching dummy hash used to keep the timing of "unknown
// email" and "wrong password" responses close to identical (BR-12) — a
// real verify still runs scrypt even when there is no such user.
const DUMMY_HASH = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${Buffer.alloc(SALT_LENGTH).toString("base64")}$${Buffer.alloc(KEY_LENGTH).toString("base64")}`;

export async function verifyPassword(plainPassword: string, storedHash: string | null): Promise<boolean> {
  const hash = storedHash ?? DUMMY_HASH;
  const parts = hash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");

  const derivedKey = await scryptAsync(plainPassword, salt, expected.length, { N: n, r, p });

  if (derivedKey.length !== expected.length) return false;
  const matches = timingSafeEqual(derivedKey, expected);

  // A null storedHash (migrated user with no password yet) must never
  // verify true, even if the dummy hash's derived key coincidentally
  // matched — that can't happen with random salts, but the check is
  // explicit rather than relying on that being astronomically unlikely.
  return storedHash !== null && matches;
}

// BR-08: 8-72 chars, at least one uppercase, one lowercase, one digit, and
// one special character. Returns a list of unmet-rule messages (empty = ok).
export function validatePasswordPolicy(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 8 || password.length > 72) {
    errors.push("Password must be 8-72 characters.");
  }
  if (!/[A-Z]/.test(password)) errors.push("Password must include an uppercase letter.");
  if (!/[a-z]/.test(password)) errors.push("Password must include a lowercase letter.");
  if (!/[0-9]/.test(password)) errors.push("Password must include a digit.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must include a special character.");
  return errors;
}
