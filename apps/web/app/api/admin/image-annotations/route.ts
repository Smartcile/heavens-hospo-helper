import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { annotationIsEmpty, normaliseAnnotation } from '@/lib/image-annotations'

// Annotation layers are ADMIN-only (the media library and the layers are
// management tooling; the floor sees the annotated images but cannot edit).
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session) return { session: null, denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (session.user.role !== 'ADMIN') {
    return { session: null, denied: NextResponse.json({ error: 'ADMIN ONLY' }, { status: 403 }) }
  }
  return { session, denied: null }
}

/** GET ?usageKey=<key> or ?usageKeys=a,b,c — every live layer for those usages. */
export async function GET(req: NextRequest) {
  const { denied } = await requireAdmin()
  if (denied) return denied

  const p = new URL(req.url)
  const single = p.searchParams.get('usageKey')
  const many = (p.searchParams.get('usageKeys') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const keys = (single ? [single] : many).slice(0, 100)
  if (keys.length === 0) {
    return NextResponse.json({ error: 'usageKey or usageKeys is required' }, { status: 400 })
  }

  const rows = await prisma.imageAnnotation.findMany({
    where: { usageKey: { in: keys }, deletedAt: null },
    select: { usageKey: true, imageUrl: true, data: true },
  })
  return NextResponse.json(
    rows.map((r) => ({ usageKey: r.usageKey, imageUrl: r.imageUrl, data: normaliseAnnotation(r.data) })),
  )
}

/**
 * PUT { usageKey, imageUrl, data } — save (or revive) one layer. Empty data
 * removes the layer: the image underneath is never touched, so removing the
 * annotation always restores the clean picture.
 */
export async function PUT(req: NextRequest) {
  const { denied } = await requireAdmin()
  if (denied) return denied

  const body = await req.json().catch(() => null)
  const usageKey = typeof body?.usageKey === 'string' ? body.usageKey.trim() : ''
  const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : ''
  if (!usageKey || usageKey.length > 200 || !imageUrl || imageUrl.length > 500) {
    return NextResponse.json({ error: 'usageKey and imageUrl are required' }, { status: 400 })
  }

  const data = normaliseAnnotation(body?.data)
  if (annotationIsEmpty(data)) {
    await prisma.imageAnnotation.updateMany({
      where: { usageKey, imageUrl, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    return NextResponse.json({ removed: true })
  }

  const row = await prisma.imageAnnotation.upsert({
    where: { usageKey_imageUrl: { usageKey, imageUrl } },
    update: { data, deletedAt: null },
    create: { usageKey, imageUrl, data },
  })
  return NextResponse.json({ id: row.id, usageKey: row.usageKey, imageUrl: row.imageUrl, data })
}
