import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { generateVenueFollowUps } from '@/lib/followups'

// GET /api/admin/followups?generate=1
// Lists OPEN follow-ups. When generate=1, first runs the MISSED-task scan for
// the in-scope venue(s) so the list is fresh.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const generate = searchParams.get('generate') === '1'

  const venueScope =
    session.user.role === 'MANAGER' ? session.user.venueId : searchParams.get('venueId') || undefined

  if (generate) {
    const venueIds = venueScope
      ? [venueScope]
      : (await prisma.venue.findMany({ where: { deletedAt: null }, select: { id: true } })).map((v) => v.id)
    for (const id of venueIds) {
      try { await generateVenueFollowUps(id) } catch { /* best-effort */ }
    }
  }

  const followUps = await prisma.followUp.findMany({
    where: { status: 'OPEN', ...(venueScope ? { venueId: venueScope } : {}) },
    include: {
      staff: { select: { firstName: true, lastName: true } },
      task: { select: { title: true } },
      module: { select: { title: true } },
      venue: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json(
    followUps.map((f) => ({
      id: f.id,
      kind: f.kind,
      detail: f.detail,
      dueDate: f.dueDate,
      staffName: `${f.staff.firstName} ${f.staff.lastName}`,
      staffId: f.staffId,
      taskTitle: f.task?.title ?? null,
      moduleId: f.moduleId,
      moduleTitle: f.module?.title ?? null,
      venueName: f.venue.name,
      createdAt: f.createdAt,
    }))
  )
}
