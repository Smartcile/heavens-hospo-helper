import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

interface Params {
  params: { filename: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const uploadPath = process.env.UPLOAD_PATH ?? '/app/uploads'
  const filePath = join(uploadPath, params.filename)

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const file = await readFile(filePath)
  const ext = params.filename.split('.').pop()?.toLowerCase() ?? ''
  const contentType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'

  return new NextResponse(file, {
    headers: { 'Content-Type': contentType },
  })
}
