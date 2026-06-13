import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

interface Params {
  params: { id: string }
}

// Staff cancel their own request (only while still pending).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.timeOffRequest.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt || existing.staffId !== session.staffId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.status !== 'PENDING') {
    return NextResponse.json({ error: 'ONLY PENDING REQUESTS CAN BE CANCELLED' }, { status: 400 })
  }

  await prisma.timeOffRequest.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
