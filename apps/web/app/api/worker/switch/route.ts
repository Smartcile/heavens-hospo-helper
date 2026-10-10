import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { createWorkerSession, setWorkerSessionCookie } from '@/lib/worker-session'

// Admin/manager → worker view without a PIN. The person is already
// authenticated on the admin session; this mints the worker JWT for their own
// staff record so the worker app opens straight away. Worker → admin still
// needs the admin password (there is no elevation path from a PIN session).
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staff = await prisma.staff.findFirst({
    where: { id: session.user.id, deletedAt: null, isActive: true },
    select: { id: true, firstName: true, venueId: true, departmentId: true, role: true },
  })
  if (!staff) return NextResponse.json({ error: 'No staff record for this login' }, { status: 404 })

  const token = await createWorkerSession({
    staffId: staff.id,
    venueId: staff.venueId,
    departmentId: staff.departmentId,
    firstName: staff.firstName,
    role: staff.role,
  })
  setWorkerSessionCookie(token)
  return NextResponse.json({ success: true })
}
