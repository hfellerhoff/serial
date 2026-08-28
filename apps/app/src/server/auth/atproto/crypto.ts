import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption-at-rest envelope for AT Protocol OAuth material. The stored
 * blobs (SDK saved state and sessions) contain refresh tokens and private
 * DPoP keys — durable credentials — so they are never written to the
 * database in the clear.
 *
 * Layout, base64-encoded for a text column:
 *   [1-byte version][12-byte IV][16-byte GCM tag][ciphertext]
 *
 * The row key (DID or OAuth state) is bound in as GCM additional
 * authenticated data, so an envelope copied onto another row fails
 * authentication instead of decrypting in the wrong context. The version
 * byte reserves room for future key or algorithm rotation.
 */

const ENVELOPE_VERSION = 0x01;

/**
 * The version byte travels outside the ciphertext, so it is bound into the
 * AAD: the day a v2 exists, a flipped byte fails authentication instead of
 * silently selecting a different decryption path.
 */
function buildAad(aad: string): Buffer {
  return Buffer.concat([
    Buffer.from([ENVELOPE_VERSION]),
    Buffer.from(aad, "utf8"),
  ]);
}
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ALGORITHM = "aes-256-gcm";

export class EnvelopeDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeDecryptionError";
  }
}

/**
 * Parse a base64 key and enforce the AES-256 length. `Buffer.from` never
 * throws on malformed base64 (it drops invalid characters), so the length
 * check is the one guard that catches every bad value.
 */
export function parseEncryptionKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ATPROTO_STORE_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes, got ${key.length}. Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

export function encryptEnvelope(
  key: Buffer,
  plaintext: string,
  aad: string,
): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(buildAad(aad));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([
    Buffer.from([ENVELOPE_VERSION]),
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]).toString("base64");
}

export function decryptEnvelope(
  key: Buffer,
  envelope: string,
  aad: string,
): string {
  const data = Buffer.from(envelope, "base64");
  if (data.length < 1 + IV_LENGTH + TAG_LENGTH) {
    throw new EnvelopeDecryptionError("Envelope too short");
  }
  if (data[0] !== ENVELOPE_VERSION) {
    throw new EnvelopeDecryptionError(
      `Unknown envelope version ${data[0] ?? "<empty>"}`,
    );
  }
  const iv = data.subarray(1, 1 + IV_LENGTH);
  const tag = data.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(1 + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(buildAad(aad));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new EnvelopeDecryptionError(
      "Envelope authentication failed (wrong key, tampered data, or mismatched row binding)",
    );
  }
}
