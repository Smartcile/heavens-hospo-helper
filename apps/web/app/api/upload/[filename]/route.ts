import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

interface Params {
  params: { filename: string }
}

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
}

export async function GET(_req: NextRequest, { params }: Params) {
  const uploadPath = process.env.UPLOAD_PATH ?? '/app/uploads'
  const filePath = join(uploadPath, params.filename)

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const file = await readFile(filePath)
  const ext = params.filename.split('.').pop()?.toLowerCase() ?? ''
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

  return new NextResponse(file, {
    headers: { 'Content-Type': contentType },
  })
}
