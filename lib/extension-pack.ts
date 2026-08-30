import { createHash } from "crypto"
import { deflateRawSync } from "zlib"
import { readdirSync, readFileSync } from "fs"
import path from "path"

const SKIP = new Set([".ds_store", "thumbs.db"])

function crc32(data: Buffer) {
  let crc = ~0
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (~crc) >>> 0
}

function shouldSkip(name: string) {
  const lower = name.toLowerCase()
  if (SKIP.has(lower)) return true
  if (lower.endsWith(".zip")) return true
  return false
}

function walkFiles(root: string, relative = ""): { name: string; data: Buffer }[] {
  const dir = path.join(root, relative)
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: { name: string; data: Buffer }[] = []

  for (const entry of entries) {
    if (shouldSkip(entry.name)) continue
    const child = relative ? `${relative}/${entry.name}` : entry.name
    const full = path.join(root, child)
    if (entry.isDirectory()) {
      files.push(...walkFiles(root, child))
      continue
    }
    if (!entry.isFile()) continue
    files.push({ name: child, data: readFileSync(full) })
  }

  return files
}

function u16(value: number) {
  const buf = Buffer.alloc(2)
  buf.writeUInt16LE(value)
  return buf
}

function u32(value: number) {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(value)
  return buf
}

function buildZip(files: { name: string; data: Buffer }[]) {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8")
    const crc = crc32(file.data)
    const compressed = deflateRawSync(file.data)
    const local = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      compressed,
    ])
    locals.push(local)
    centrals.push(
      Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x01, 0x02]),
        u16(20),
        u16(20),
        u16(0),
        u16(8),
        u16(0),
        u16(0),
        u32(crc),
        u32(compressed.length),
        u32(file.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    )
    offset += local.length
  }

  const central = Buffer.concat(centrals)
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ])

  return Buffer.concat([...locals, central, eocd])
}

export function getExtensionRoot() {
  return path.join(process.cwd(), "extension")
}

export function readExtensionVersion() {
  const manifest = JSON.parse(readFileSync(path.join(getExtensionRoot(), "manifest.json"), "utf8")) as {
    version?: string
  }
  const version = String(manifest.version || "0.0.0").trim()
  if (!/^\d+\.\d+\.\d+/.test(version)) return "0.0.0"
  return version
}

export function extensionZipFilename(version = readExtensionVersion()) {
  return `journal-book-extension-${version}.zip`
}

export function packExtensionZip() {
  const version = readExtensionVersion()
  const folder = `journal-book-extension-${version}`
  const files = walkFiles(getExtensionRoot()).map((file) => ({
    name: `${folder}/${file.name}`,
    data: file.data,
  }))
  if (!files.length) throw new Error("Extension folder is empty")
  const zip = buildZip(files)
  return {
    version,
    filename: extensionZipFilename(version),
    zip,
    etag: createHash("sha1").update(zip).digest("hex"),
  }
}
