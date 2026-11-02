import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readdir, stat } from 'fs/promises'
import { storageRootPath, resolveWithinRoot, STORAGE_ROOTS, type StorageRoot } from '@/lib/storage'
import { fileUsages, fileUsagesForNames } from '@/lib/file-usage'
import path from 'path'

async function adminGuard(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

/**
 * GET /api/admin/files/usage
 *   ?root=…&path=<file>        → usage of one file            { usages }
 *   ?root=…&dir=<dir>&name=a&name=b  → usage per listed file   { usagesByFile }
 * Answers "where is this file used?" for the file manager's tags.
 */
export async function GET(req: NextRequest) {
  const denied = await adminGuard()
  if (denied) return denied

  const p = new URL(req.url)
  const rootParam = p.searchParams.get('root')
  const root = STORAGE_ROOTS.includes(rootParam as StorageRoot) ? (rootParam as StorageRoot) : null
  if (!root) return NextResponse.json({ error: 'Unknown root' }, { status: 400 })

  const single = p.searchParams.get('path')
  if (single) {
    const base = storageRootPath(root)
    const target = resolveWithinRoot(base, single)
    if (!target) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    const s = await stat(target).catch(() => null)
    if (!s || s.isDirectory()) return NextResponse.json({ error: 'Not a file' }, { status: 404 })
    return NextResponse.json({ usages: await fileUsages(path.basename(target)) })
  }

  const dir = p.searchParams.get('dir')
  if (dir !== null) {
    const base = storageRootPath(root)
    const target = resolveWithinRoot(base, dir)
    if (!target) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    // Only accept names that actually exist in the listed directory.
    const dirents = await readdir(target, { withFileTypes: true }).catch(() => [])
    const present = new Set(dirents.filter((d) => d.isFile()).map((d) => d.name))
    const names = p.searchParams.getAll('name').map((n) => path.basename(n)).filter((n) => present.has(n))
    return NextResponse.json({ usagesByFile: await fileUsagesForNames(names) })
  }

  return NextResponse.json({ error: 'Provide path or dir' }, { status: 400 })
}
