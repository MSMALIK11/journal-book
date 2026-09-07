// One-off diagnostic: prints the raw Delta wallet response for each stored account.
// Usage: node scripts/debug-delta-wallet.mjs [demo|live]
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import mongoose from "mongoose"

const root = process.cwd()
for (const file of [".env.local", ".env"]) {
  const full = path.join(root, file)
  if (!fs.existsSync(full)) continue
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key]) continue
    process.env[key] = rawValue.replace(/^["']|["']$/g, "")
  }
}

const environment = process.argv[2] === "live" ? "live" : "demo"

function decryptSecret(blob) {
  const buf = Buffer.from(blob, "base64")
  const iv = buf.subarray(0, 16)
  const tag = buf.subarray(16, 32)
  const data = buf.subarray(32)
  const key = crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY).digest()
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data) + decipher.final("utf8")
}

function baseUrl() {
  if (environment === "live") return "https://api.india.delta.exchange"
  return (process.env.DELTA_BASE_URL || "https://cdn-ind.testnet.deltaex.org").replace(/\/$/, "")
}

async function walletBalances(apiKey, apiSecret) {
  const method = "GET"
  const requestPath = "/v2/wallet/balances"
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(method + timestamp + requestPath)
    .digest("hex")

  const response = await fetch(baseUrl() + requestPath, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
      timestamp,
      signature,
    },
  })
  const text = await response.text()
  return { status: response.status, text }
}

await mongoose.connect(process.env.MONGODB_URI)
const creds = await mongoose.connection.db
  .collection("brokercredentials")
  .find({ provider: "delta" })
  .toArray()

console.log(`base url: ${baseUrl()}`)
console.log(`accounts found: ${creds.length}\n`)

for (const doc of creds) {
  const env = doc.environment ?? "demo"
  if (env !== environment) continue
  console.log(`── ${doc.label} (${doc._id}) env=${env} enabled=${doc.enabled !== false}`)
  try {
    const apiKey = decryptSecret(doc.encryptedKey)
    const apiSecret = decryptSecret(doc.encryptedSecret)
    console.log(`   api key ····${apiKey.slice(-4)}`)
    const { status, text } = await walletBalances(apiKey, apiSecret)
    console.log(`   HTTP ${status}`)
    try {
      const json = JSON.parse(text)
      console.log(`   meta: ${JSON.stringify(json.meta ?? null)}`)
      const rows = Array.isArray(json.result) ? json.result : []
      console.log(`   rows: ${rows.length}`)
      for (const row of rows) {
        console.log(
          `     asset=${row.asset_symbol} balance=${row.balance} available=${row.available_balance} blocked=${row.blocked_margin}`,
        )
      }
      if (rows.length === 0) console.log(`   raw: ${text.slice(0, 500)}`)
    } catch {
      console.log(`   raw: ${text.slice(0, 500)}`)
    }
  } catch (error) {
    console.log(`   ERROR: ${error.message}`)
  }
  console.log("")
}

await mongoose.disconnect()
