import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { mkdir, readdir, stat } from 'fs/promises'
import path from 'path'
import { storageRoot } from '@/lib/storage'

// The media library behind the pickers' BROWSE LIBRARY button. Everything the
// upload endpoints write lands flat in the storage root, so a simple list of
// that directory is the whole library. ADMIN-only, like the file browser.

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const MAX_FILES = 500

/** GET /api/admin/media — the newest image uploads, newest first. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'ADMIN ONLY' }, { status: 403 })

  const root = storageRoot()
  await mkdir(root, { recursive: true })

  const dirents = await readdir(root, { withFileTypes: true }).catch(() => [])
  const files: { name: string; url: string; size: number; mtime: string }[] = []
  for (const d of dirents) {
    if (!d.isFile()) continue
    const ext = d.name.split('.').pop()?.toLowerCase() ?? ''
    if (!IMAGE_EXT.has(ext)) continue
    const s = await stat(path.join(root, d.name)).catch(() => null)
    if (!s) continue
    files.push({
      name: d.name,
      url: `/api/upload/${encodeURIComponent(d.name)}`,
      size: s.size,
      mtime: s.mtime.toISOString(),
    })
  }
  files.sort((a, b) => b.mtime.localeCompare(a.mtime))
  return NextResponse.json({ files: files.slice(0, MAX_FILES) })
}
