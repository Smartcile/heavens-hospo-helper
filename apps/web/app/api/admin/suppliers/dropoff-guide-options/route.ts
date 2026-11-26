import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

// The supplier form's drop-off picker. Deliberately narrow (id/title/status)
// and gated by the inventory grant the supplier screen already needs, so a
// restricted manager can assign a guide without Playbook view access.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.view')
  if (denied) return denied

  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : req.nextUrl.searchParams.get('venueId') || session.user.venueId

  const guides = await prisma.guide.findMany({
    where: { venueId, deletedAt: null, guideType: 'SUPPLIER_INFO' },
    select: { id: true, title: true, status: true },
    orderBy: { title: 'asc' },
  })
  return NextResponse.json(guides)
}
