import crypto from "crypto"

const ALGO = "aes-256-gcm"
const IV_LEN = 16
const AUTH_TAG_LEN = 16

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw || raw.length < 32) {
    throw new Error("ENCRYPTION_KEY must be set (min 32 chars for AES-256)")
  }
  return crypto.createHash("sha256").update(raw).digest()
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_LEN)
  const key = getKey()
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString("base64")
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, "base64")
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN)
  const data = buf.subarray(IV_LEN + AUTH_TAG_LEN)
  const key = getKey()
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data) + decipher.final("utf8")
}
