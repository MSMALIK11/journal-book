const MAX_IMAGE_BYTES = 1_200_000

function isJpeg(bytes: Buffer) {
  return bytes[0] === 0xff && bytes[1] === 0xd8
}

function isPng(bytes: Buffer) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}

/** Decode a live chart image for Telegram only. Never persist. */
export function decodeScreenshotJpeg(input?: string | null): Buffer | null {
  if (!input || typeof input !== "string") return null
  const trimmed = input.trim()
  if (!trimmed) return null

  const dataUrl = trimmed.match(/^data:image\/(?:jpeg|jpg|png);base64,(.+)$/i)
  const b64 = (dataUrl ? dataUrl[1] : trimmed).replace(/\s+/g, "")
  if (!b64 || b64.length > 1_800_000) return null

  try {
    const image = Buffer.from(b64, "base64")
    if (image.length < 32 || image.length > MAX_IMAGE_BYTES) return null
    if (!isJpeg(image) && !isPng(image)) return null
    return image
  } catch {
    return null
  }
}
