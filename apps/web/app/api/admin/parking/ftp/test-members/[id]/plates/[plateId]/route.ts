import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'

// Remove a remembered plate from a test member. Plates are added by the kiosk;
// this is only the cleanup path for testing a first-time / add-plate flow.

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; plateId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const member = await prisma.member.findFirst({
    where: { id: params.id, venueId: scoped.venueId, deletedAt: null },
    select: { id: true },
  })
  if (!member) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })

  const plate = await prisma.memberPlate.findFirst({
    where: {
      id: params.plateId,
      memberId: member.id,
      venueId: scoped.venueId,
      deletedAt: null,
    },
    select: { id: true, isDefault: true },
  })
  if (!plate) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    await tx.memberPlate.update({
      where: { id: plate.id },
      data: { deletedAt: new Date(), status: 'RETIRED' },
    })
    if (plate.isDefault) {
      const next = await tx.memberPlate.findFirst({
        where: { memberId: member.id, status: 'ACTIVE', deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      if (next) {
        await tx.memberPlate.update({ where: { id: next.id }, data: { isDefault: true } })
      }
    }
  })

  return NextResponse.json({ ok: true })
}
