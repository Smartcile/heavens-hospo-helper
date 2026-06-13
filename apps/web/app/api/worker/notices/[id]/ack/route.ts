import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

interface Params {
  params: { id: string }
}

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notice = await prisma.notice.findUnique({
    where: { id: params.id },
    select: { id: true, venueId: true, deletedAt: true },
  })
  if (!notice || notice.deletedAt || notice.venueId !== session.venueId) {
    return NextResponse.json({ error: 'NOTICE NOT FOUND' }, { status: 404 })
  }

  await prisma.noticeAck.upsert({
    where: { noticeId_staffId: { noticeId: params.id, staffId: session.staffId } },
    update: {},
    create: { noticeId: params.id, staffId: session.staffId },
  })

  return NextResponse.json({ success: true }, { status: 201 })
}
