import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { listReferenceTargets, resolveReferences } from '@/lib/beo-references.server'

/**
 * GET /api/admin/beo-references?venueId= — every attachable guide/task/checklist.
 * GET /api/admin/beo-references?venueId=&guides=a,b&tasks=c&checklists=d — resolve
 * the requested ids (guides include their steps) for the reference viewer.
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

  const list = (key: string) => (params.get(key) ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const guideIds = list('guides')
  const taskIds = list('tasks')
  const checklistIds = list('checklists')

  if (guideIds.length || taskIds.length || checklistIds.length) {
    return NextResponse.json(await resolveReferences(venueId, { guideIds, taskIds, checklistIds }))
  }
  return NextResponse.json(await listReferenceTargets(venueId))
}
