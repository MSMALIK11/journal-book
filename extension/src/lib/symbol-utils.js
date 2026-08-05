// Shared TradingView symbol cleanup — works in extension + page MAIN world.
var JBSymbol = globalThis.JBSymbol || {}

JBSymbol.KNOWN_TICKERS = [
  "XAUUSD",
  "XAGUSD",
  "GOLD",
  "SILVER",
  "BTCUSDT",
  "BTCUSD",
  "ETHUSDT",
  "ETHUSD",
  "SOLUSDT",
  "SOLUSD",
  "USOIL",
  "UKOIL",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCHF",
  "AUDUSD",
  "USDCAD",
  "NZDUSD",
]

JBSymbol.decodeRaw = function decodeRaw(raw) {
  if (!raw) return ""
  let value = String(raw).trim()
  try {
    value = decodeURIComponent(value)
  } catch {
    // keep original
  }
  return value.replace(/%3A/gi, ":").replace(/\s+/g, " ").trim()
}

JBSymbol.extractKnownTicker = function extractKnownTicker(text) {
  const upper = String(text || "").toUpperCase()
  let best = ""
  for (const ticker of JBSymbol.KNOWN_TICKERS) {
    if (upper.endsWith(ticker) && ticker.length > best.length) {
      best = ticker
    } else if (!best && upper.includes(ticker)) {
      best = ticker
    }
  }
  if (best === "GOLD") return "XAUUSD"
  if (best === "SILVER") return "XAGUSD"
  return best
}

JBSymbol.fromTitle = function fromTitle(title) {
  const first = (title || "").split("—")[0]?.split(",")[0]?.trim() || ""
  if (!first) return ""

  if (/gold/i.test(first)) return "XAUUSD"
  if (/silver/i.test(first)) return "XAGUSD"
  if (/(\bwt\b|crude|\boil\b)/i.test(first)) return "USOIL"
  if (/bitcoin|\bbtc\b/i.test(first)) return "BTCUSD"
  if (/ethereum|\beth\b/i.test(first)) return "ETHUSD"

  const known = JBSymbol.extractKnownTicker(first)
  if (known) return known

  const ticker = first.match(/^([A-Z0-9./:]{3,20})/i)?.[1]
  if (ticker) return JBSymbol.normalize(ticker)

  return ""
}

JBSymbol.normalize = function normalize(raw) {
  if (!raw) return ""

  let decoded = JBSymbol.decodeRaw(raw)
  if (decoded.includes(":")) {
    decoded = decoded.split(":").pop().trim()
  }

  let normalized = decoded.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  if (!normalized) return ""

  // COINEX%3ABTCUSDT → COINEX3ABTCUSDT without decode
  const encodedColon = normalized.match(/3A([A-Z0-9]{3,12})$/i)
  if (encodedColon) return encodedColon[1]

  const suffix = normalized.match(
    /(XAUUSD|XAGUSD|BTCUSDT|BTCUSD|ETHUSDT|ETHUSD|SOLUSDT|SOLUSD|USOIL|UKOIL|EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|USDCAD|NZDUSD)$/i,
  )
  if (suffix && normalized.length > suffix[1].length + 2) {
    return suffix[1]
  }

  if (normalized.length > 12) {
    const known = JBSymbol.extractKnownTicker(normalized)
    if (known) return known
    return ""
  }

  if (normalized === "GOLD") return "XAUUSD"
  if (normalized === "SILVER") return "XAGUSD"

  if (/^(COINEX|BINANCE|BYBIT|OKX|OANDA|TVC|FOREXCOM|BITGET|KUCOIN)/i.test(normalized)) {
    const known = JBSymbol.extractKnownTicker(normalized)
    if (known) return known
    return ""
  }

  return normalized
}

globalThis.JBSymbol = JBSymbol
