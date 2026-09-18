import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { loadBlockLinks, saveBlockLinks, type BlockLinkInput } from '@/lib/beo-links.server'

/**
 * GET  /api/admin/beo-block-links?venueId=&blockType= — playbook links.
 * PUT  /api/admin/beo-block-links                      — replace one area's links.
 * Body: { venueId, blockType, guideIds, taskIds, checklistIds }.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.blocks')
  if (denied) return denied

  const params = new URL(req.url).searchParams
  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : params.get('venueId') ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'Venue is required' }, { status: 400 })

  const blockType = params.get('blockType')
  const links = await loadBlockLinks(venueId)
  return NextResponse.json(blockType ? links.filter((l) => l.blockType === blockType) : links)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.blocks')
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : typeof body.venueId === 'string'
        ? body.venueId
        : session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'Venue is required' }, { status: 400 })

  const blockType = String(body.blockType ?? '').trim()
  if (!blockType) return NextResponse.json({ error: 'blockType is required' }, { status: 400 })

  const asIds = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [])
  const input: BlockLinkInput = {
    guideIds: asIds(body.guideIds),
    taskIds: asIds(body.taskIds),
    checklistIds: asIds(body.checklistIds),
  }
  await saveBlockLinks(venueId, blockType, input)

  const links = await loadBlockLinks(venueId)
  return NextResponse.json(links.filter((l) => l.blockType === blockType))
}
