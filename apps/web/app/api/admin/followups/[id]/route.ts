import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

// PATCH /api/admin/followups/[id]  { action: 'resolve' | 'signoff' }
// resolve → mark RESOLVED. signoff (UNTRAINED only) → record a manager sign-off
// for the staff + guide, then resolve.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.followups.resolve')
  if (denied) return denied

  const fu = await prisma.followUp.findUnique({ where: { id: params.id } })
  if (!fu) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && fu.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { action } = await req.json()

  if (action === 'signoff') {
    if (fu.guideId) {
      await prisma.guideCompletion.upsert({
        where: { guideId_staffId: { guideId: fu.guideId, staffId: fu.staffId } },
        create: {
          guideId: fu.guideId,
          staffId: fu.staffId,
          selfCompleted: false,
          signedOffById: session.user.id,
          note: 'Signed off from follow-up',
        },
        update: { selfCompleted: false, signedOffById: session.user.id },
      })
    } else if (fu.moduleId) {
      // Legacy row raised before the guide rewire — keep it actionable.
      await prisma.trainingCompletion.upsert({
        where: { moduleId_staffId: { moduleId: fu.moduleId, staffId: fu.staffId } },
        create: {
          moduleId: fu.moduleId,
          staffId: fu.staffId,
          selfCompleted: false,
          signedOffById: session.user.id,
          note: 'Signed off from follow-up',
        },
        update: { selfCompleted: false, signedOffById: session.user.id },
      })
    } else {
      return NextResponse.json({ error: 'No guide on this follow-up' }, { status: 400 })
    }
  }

  const updated = await prisma.followUp.update({
    where: { id: params.id },
    data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: session.user.id },
  })

  return NextResponse.json(updated)
}
