import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readdir, stat, unlink, mkdir } from 'fs/promises'
import { storageRootPath, resolveWithinRoot, STORAGE_ROOTS, type StorageRoot } from '@/lib/storage'
import { fileUsages } from '@/lib/file-usage'
import { pushProduct } from '@/lib/woo-push'
import { prisma } from '@hospo-ops/db'
import path from 'path'

interface FileEntry {
  name: string
  dir: boolean
  size: number
  mtime: string
}

function parseParams(url: string): { root: StorageRoot | null; path: string } {
  const p = new URL(url)
  const root = p.searchParams.get('root')
  return {
    root: STORAGE_ROOTS.includes(root as StorageRoot) ? (root as StorageRoot) : null,
    path: p.searchParams.get('path') ?? '',
  }
}

// Admin-only (files are not venue-scoped and include DB backups). Mirrors the
// backup route's gate.
async function adminGuard(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

/** GET /api/admin/files?root=media|backups&path=<dir> — list a directory. */
export async function GET(req: NextRequest) {
  const denied = await adminGuard()
  if (denied) return denied

  const { root, path: rel } = parseParams(req.url)
  if (!root) return NextResponse.json({ error: 'Unknown root' }, { status: 400 })

  const base = storageRootPath(root)
  // Create the root lazily so the very first browse works on fresh installs.
  await mkdir(base, { recursive: true })
  const target = resolveWithinRoot(base, rel)
  if (!target) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })

  let entries: FileEntry[]
  try {
    const dirents = await readdir(target, { withFileTypes: true })
    const listed = await Promise.all(
      dirents.map(async (d) => {
        const full = path.join(target, d.name)
        const s = await stat(full)
        return {
          name: d.name,
          dir: d.isDirectory(),
          size: s.size,
          mtime: s.mtime.toISOString(),
        }
      }),
    )
    entries = listed.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
  } catch {
    return NextResponse.json({ error: 'Could not read directory' }, { status: 500 })
  }

  return NextResponse.json({ root, path: rel, entries })
}

/** DELETE /api/admin/files?root=…&path=<file> — permanently delete one file. */
export async function DELETE(req: NextRequest) {
  const denied = await adminGuard()
  if (denied) return denied

  const { root, path: rel } = parseParams(req.url)
  if (!root) return NextResponse.json({ error: 'Unknown root' }, { status: 400 })

  const base = storageRootPath(root)
  const target = resolveWithinRoot(base, rel)
  if (!target || target === base) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })

  const s = await stat(target).catch(() => null)
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (s.isDirectory()) {
    return NextResponse.json({ error: 'Only files can be deleted' }, { status: 400 })
  }

  // Product photo files delete WITH their references: the image is detached
  // from every product that uses it and removed from WordPress (the store
  // product + its media attachment) — only then is the local file deleted.
  // Anything else that is still linked blocks the delete (409).
  const usages = await fileUsages(path.basename(target))
  const PRODUCT_KINDS = new Set(['menu', 'woo-image'])
  const blocking = usages.filter((u) => !PRODUCT_KINDS.has(u.kind))
  if (blocking.length > 0) {
    return NextResponse.json(
      { error: 'FILE IS LINKED — REMOVE OR RE-LINK IT FIRST', usages: blocking },
      { status: 409 },
    )
  }

  for (const usage of usages) {
    if (!PRODUCT_KINDS.has(usage.kind)) continue
    const item = await prisma.menuItem.findUnique({
      where: { id: usage.id },
      select: { id: true, venueId: true, imageUrl: true, deletedAt: true },
    }).catch(() => null)
    if (!item || item.deletedAt || !item.imageUrl) continue
    // Detach locally first — pushProduct then sends images: [] (because the
    // row still carries its wooImageId) and reconcile removes the WordPress
    // media attachment. Best-effort; never blocks the file delete.
    await prisma.menuItem.update({ where: { id: item.id }, data: { imageUrl: null } }).catch(() => {})
    await pushProduct(item.id)
  }

  await unlink(target).catch(() => null)
  return NextResponse.json({ ok: true })
}
