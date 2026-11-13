import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import {
  nextPlateFromApproval,
  reviewTransitionError,
  validateReviewAction,
} from '@/lib/staff-parking'

// Manager approves or rejects a staff plate request. Approval retires the
// specific plate being replaced (if any) and creates the new ACTIVE plate with
// its "entered in the system" tick reset to false.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const request = await prisma.staffParkingPlateRequest.findUnique({
    where: { id: params.id },
  })
  if (!request || request.deletedAt) {
    return NextResponse.json({ error: 'REQUEST NOT FOUND' }, { status: 404 })
  }

  const scoped = resolveScopedVenueId(session, req, request.venueId)
  if ('error' in scoped || scoped.venueId !== request.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = validateReviewAction(body.action)
  if (!action) return NextResponse.json({ error: 'INVALID ACTION' }, { status: 422 })

  const transitionError = reviewTransitionError(request.status)
  if (transitionError) {
    return NextResponse.json({ error: transitionError }, { status: 409 })
  }

  const note = typeof body.note === 'string' ? body.note.trim() || null : null
  const reviewerId = session.user.id

  if (action === 'REJECT') {
    const rejected = await prisma.staffParkingPlateRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note,
      },
    })
    return NextResponse.json({ request: rejected, plate: null })
  }

  const existing = await prisma.staffParkingPlate.findMany({
    where: {
      venueId: request.venueId,
      staffId: request.staffId,
      deletedAt: null,
      status: 'ACTIVE',
    },
    select: { id: true, plate: true, status: true },
  })

  const plan = nextPlateFromApproval({
    existing,
    plate: request.plate,
    previousPlate: request.previousPlate,
  })
  const alreadyActive = existing.some(
    (row) => row.plate === plan.plate && row.status === 'ACTIVE',
  )

  const result = await prisma.$transaction(async (tx) => {
    if (plan.retireIds.length > 0) {
      await tx.staffParkingPlate.updateMany({
        where: { id: { in: plan.retireIds } },
        data: { status: 'RETIRED' },
      })
    }

    const plate = alreadyActive
      ? null
      : await tx.staffParkingPlate.create({
          data: {
            venueId: request.venueId,
            staffId: request.staffId,
            plate: plan.plate,
            status: 'ACTIVE',
            enteredInSystem: false,
            approvedById: reviewerId,
            approvedAt: new Date(),
          },
        })

    const reviewed = await tx.staffParkingPlateRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note,
      },
    })

    return { plate, request: reviewed }
  })

  return NextResponse.json(result)
}
