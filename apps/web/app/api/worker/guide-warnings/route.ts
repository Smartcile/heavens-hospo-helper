import { NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { prisma } from '@hospo-ops/db'
import { guideWarningsForVenue } from '@/lib/guide-warnings.server'
import { workerMayAssignTraining, workerMayViewAllTraining } from '@/lib/worker-guide-access'

// Worker-side warnings list. Managers/admins and staff with PLAYBOOK VIEW see
// the whole venue; everyone else sees only their own warnings. The same payload
// carries the person/guide picker options when the session may mark retraining.
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [canViewAll, canAssign] = await Promise.all([
    workerMayViewAllTraining(session),
    workerMayAssignTraining(session),
  ])

  const data = await guideWarningsForVenue(
    session.venueId,
    canViewAll ? {} : { staffId: session.staffId },
  )
  if (!data) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })

  let retrainOptions: {
    staff: { id: string; name: string }[]
    guides: { id: string; title: string; folderId: string | null }[]
    folders: { id: string; name: string; sortOrder: number }[]
  } | null = null

  if (canAssign) {
    const [staff, guides, folders] = await Promise.all([
      prisma.staff.findMany({
        where: { venueId: session.venueId, deletedAt: null, isActive: true },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      prisma.guide.findMany({
        where: {
          venueId: session.venueId,
          deletedAt: null,
          status: 'PUBLISHED',
          isTracked: true,
        },
        select: { id: true, title: true, folderId: true },
        orderBy: { title: 'asc' },
      }),
      prisma.guideFolder.findMany({
        where: { venueId: session.venueId, deletedAt: null },
        select: { id: true, name: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ])
    retrainOptions = {
      staff: staff.map((s) => ({ id: s.id, name: `${s.lastName}, ${s.firstName}` })),
      guides,
      folders,
    }
  }

  // An ordinary worker only gets their own warnings — do not leak the venue's
  // guide titles/folders. Authorised staff get the picker via retrainOptions.
  if (!canViewAll) {
    return NextResponse.json({
      ...data,
      guides: [],
      folders: [],
      canViewAll,
      canAssign,
      retrainOptions,
    })
  }

  return NextResponse.json({ ...data, canViewAll, canAssign, retrainOptions })
}
