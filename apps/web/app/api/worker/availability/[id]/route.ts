import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

// Clear one day's availability (soft delete). Ownership is enforced; a miss
// returns 404 so existence is not leaked.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.staffAvailability.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt || existing.staffId !== session.staffId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.staffAvailability.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
