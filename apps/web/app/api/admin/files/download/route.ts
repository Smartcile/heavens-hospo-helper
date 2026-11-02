import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readFile } from 'fs/promises'
import { storageRootPath, resolveWithinRoot, STORAGE_ROOTS, type StorageRoot } from '@/lib/storage'
import path from 'path'

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  sql: 'application/sql',
  md: 'text/markdown',
}

/** GET /api/admin/files/download?root=media|backups&path=<file>[&inline=1]
 *  Streams one stored file. `inline=1` opens images/PDFs in a new tab
 *  instead of downloading (the file browser's OPEN action). */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const p = new URL(req.url)
  const rootParam = p.searchParams.get('root')
  const root = STORAGE_ROOTS.includes(rootParam as StorageRoot) ? (rootParam as StorageRoot) : null
  const rel = p.searchParams.get('path') ?? ''
  if (!root) return NextResponse.json({ error: 'Unknown root' }, { status: 400 })

  const base = storageRootPath(root)
  const target = resolveWithinRoot(base, rel)
  if (!target || target === base) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })

  const buffer = await readFile(target).catch(() => null)
  if (!buffer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const name = path.basename(target)
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const inline = p.searchParams.get('inline') === '1' && (MIME[ext]?.startsWith('image/') || MIME[ext] === 'application/pdf')
  const disposition = inline ? 'inline' : 'attachment'

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${name.replace(/[^a-z0-9._ -]/gi, '_')}"`,
    },
  })
}
