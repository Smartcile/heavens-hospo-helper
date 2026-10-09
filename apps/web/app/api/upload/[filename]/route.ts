import { NextRequest, NextResponse } from 'next/server'
import { mkdir, readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import sharp from 'sharp'
import { parseThumbWidth } from '@/lib/image-thumb'

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

/** Formats the `?w=` resizer knows how to re-encode (svg/gif/animation pass through). */
const RESIZABLE = new Set(['jpg', 'jpeg', 'png', 'webp'])
const THUMB_DIR = '.thumbs'

/**
 * Serve an upload. `?w=<px>` returns (and caches) a downscaled copy — used by
 * grids, pickers and previews so a 5 MB camera JPEG is never decoded for a
 * 64 px thumbnail. The original is always available without the parameter.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const uploadPath = process.env.UPLOAD_PATH ?? '/app/uploads'
  const name = params.filename
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const filePath = join(uploadPath, name)
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'
  const width = parseThumbWidth(req.nextUrl.searchParams.get('w'))

  if (width != null && RESIZABLE.has(ext)) {
    const cachePath = join(uploadPath, THUMB_DIR, `${width}-${name}`)
    if (!existsSync(cachePath)) {
      try {
        await mkdir(dirname(cachePath), { recursive: true })
        const pipeline = sharp(filePath).rotate().resize({ width, withoutEnlargement: true })
        const out = ext === 'png'
          ? pipeline.png({ compressionLevel: 9 })
          : ext === 'webp'
            ? pipeline.webp({ quality: 80 })
            : pipeline.jpeg({ quality: 80, mozjpeg: true })
        await out.toFile(cachePath)
      } catch {
        // Fall through to the original — a resize failure must never 500.
      }
    }
    if (existsSync(cachePath)) {
      const thumb = await readFile(cachePath)
      return new NextResponse(thumb, {
        headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
      })
    }
  }

  const file = await readFile(filePath)
  return new NextResponse(file, {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
