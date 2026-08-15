import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

// The audit trail behind the VIEW EDITS button: every field change ever made
// to a clock entry, newest first.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'team.clocks.view')
  if (denied) return denied

  const existing = await prisma.timeClock.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const edits = await prisma.timeClockEdit.findMany({
    where: { timeClockId: params.id },
    orderBy: { editedAt: 'desc' },
    take: 100,
  })

  return NextResponse.json(edits)
}
