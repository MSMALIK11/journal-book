import { NextResponse } from "next/server"
import { packExtensionZip } from "@/lib/extension-pack"

export const runtime = "nodejs"

export async function GET() {
  try {
    const packed = packExtensionZip()
    return new NextResponse(new Uint8Array(packed.zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${packed.filename}"`,
        "Cache-Control": "private, max-age=60",
        ETag: `"${packed.etag}"`,
      },
    })
  } catch (error) {
    console.error("Failed to pack extension:", error)
    return NextResponse.json({ error: "Unable to build extension zip" }, { status: 500 })
  }
}
