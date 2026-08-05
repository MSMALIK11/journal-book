// MAIN world — read the active TradingView chart symbol (with retry).
function jbGetChartSymbolOnce() {
  try {
    const chart = window.tvWidget?.activeChart?.()
    const sym = chart?.symbol?.() || chart?.symbolExt?.()
    if (sym) {
      const normalized = JBSymbol.normalize(sym)
      if (normalized) return normalized
    }
  } catch {
    // ignore
  }

  const toolbarSelectors = [
    '[data-name="legend-source-title"]',
    '[data-name="header-toolbar-symbol-search"]',
    '[data-symbol]',
    '[class*="symbolTitle"]',
    '[class*="symbol-title"]',
    '#header-toolbar-symbol-search',
  ]

  for (const selector of toolbarSelectors) {
    const el = document.querySelector(selector)
    if (!el) continue
    const attr = el.getAttribute?.("data-symbol")
    if (attr?.trim()) {
      const normalized = JBSymbol.normalize(attr)
      if (normalized) return normalized
    }
    const text = el.textContent?.trim()
    if (text && text.length <= 32) {
      const normalized = JBSymbol.normalize(text)
      if (normalized) return normalized
    }
  }

  const fromTitle = JBSymbol.fromTitle(document.title)
  if (fromTitle) return fromTitle

  const symbolParam = location.href.match(/symbol=([^&]+)/i)
  if (symbolParam) {
    const normalized = JBSymbol.normalize(decodeURIComponent(symbolParam[1]))
    if (normalized) return normalized
  }

  return ""
}
