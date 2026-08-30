import { NextResponse } from "next/server"
import { extensionZipFilename, readExtensionVersion } from "@/lib/extension-pack"

export async function GET() {
  try {
    const version = readExtensionVersion()
    return NextResponse.json({
      version,
      filename: extensionZipFilename(version),
      downloadUrl: "/api/extension/download",
    })
  } catch {
    return NextResponse.json({ error: "Extension pack is not available" }, { status: 500 })
  }
}
