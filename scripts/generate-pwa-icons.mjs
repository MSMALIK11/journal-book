#!/usr/bin/env node
/** Regenerate PNG PWA icons from SVG sources. Run: npx @resvg/resvg-js ... or npm run icons:pwa */
import { readFileSync, writeFileSync } from "node:fs"
import { Resvg } from "@resvg/resvg-js"

const root = new URL("../public/icons/", import.meta.url)

function renderSvg(relativePath, width, outputName) {
  const svg = readFileSync(new URL(relativePath, root))
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng()
  writeFileSync(new URL(outputName, root), png)
  console.log(`wrote ${outputName} (${width}px)`)
}

renderSvg("icon.svg", 512, "icon-512.png")
renderSvg("icon.svg", 192, "icon-192.png")
renderSvg("icon.svg", 180, "apple-touch-icon.png")
renderSvg("icon-maskable.svg", 512, "icon-maskable-512.png")
