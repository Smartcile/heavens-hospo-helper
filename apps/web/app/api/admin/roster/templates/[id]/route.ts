import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const template = await prisma.rosterTemplate.findUnique({
    where: { id: params.id },
    select: { id: true, venueId: true, deletedAt: true },
  })
  if (!template || template.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const scoped = resolveScopedVenueId(session, req, template.venueId)
  if ('error' in scoped || scoped.venueId !== template.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const deletedAt = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.rosterTemplate.update({ where: { id: params.id }, data: { deletedAt } })
    await tx.rosterTemplateShift.updateMany({
      where: { templateId: params.id, deletedAt: null },
      data: { deletedAt },
    })
  })
  return NextResponse.json({ success: true })
}
