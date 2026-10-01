import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerGuideAccess } from '@/lib/worker-guide-access'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

// Toggle DRAFT ↔ PUBLISHED from the worker app (publish grant required).
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerGuideAccess(session)
  if (!access.canPublish) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const status = body?.status
  if (status !== 'DRAFT' && status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'INVALID STATUS' }, { status: 400 })
  }

  const existing = await prisma.guide.findUnique({
    where: { id: params.id },
    select: { venueId: true, deletedAt: true },
  })
  if (!existing || existing.deletedAt || existing.venueId !== session.venueId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const guide = await prisma.guide.update({ where: { id: params.id }, data: { status } })
  return NextResponse.json(guide)
}
