import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// POST { status: 'APPROVED' | 'REJECTED', reason? } — approval workflow.
// Only APPROVED sessions count toward payroll.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.timeClock.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const status = body?.status
  if (status !== 'APPROVED' && status !== 'REJECTED') {
    return NextResponse.json({ error: 'STATUS MUST BE APPROVED OR REJECTED' }, { status: 400 })
  }
  if (existing.isActive) {
    return NextResponse.json({ error: 'CANNOT APPROVE AN ACTIVE SESSION' }, { status: 409 })
  }

  const tc = await prisma.timeClock.update({
    where: { id: params.id },
    data: {
      approvalStatus: status,
      approvedById: session.user.id,
      approvedAt: new Date(),
      rejectedReason: status === 'REJECTED' ? body?.reason?.trim() || null : null,
    },
  })

  return NextResponse.json(tc)
}
