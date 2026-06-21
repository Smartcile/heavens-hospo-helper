import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import bcrypt from 'bcryptjs'
import { createWorkerSession, workerCookieSecure } from '@/lib/worker-session'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { venueId, pin } = body

  if (!venueId || !pin) {
    return NextResponse.json({ error: 'Venue and PIN required' }, { status: 400 })
  }

  // Find staff matching PIN in this venue
  const staffList = await prisma.staff.findMany({
    where: {
      venueId,
      isActive: true,
      deletedAt: null,
      pin: { not: null },
    },
  })

  let matched: typeof staffList[0] | null = null
  for (const staff of staffList) {
    if (!staff.pin) continue
    const valid = await bcrypt.compare(String(pin), staff.pin)
    if (valid) {
      matched = staff
      break
    }
  }

  if (!matched) {
    return NextResponse.json({ error: 'INCORRECT PIN' }, { status: 401 })
  }

  const sessionToken = await createWorkerSession({
    staffId: matched.id,
    venueId,
    departmentId: matched.departmentId,
    firstName: matched.firstName,
  })

  const response = NextResponse.json({ success: true, firstName: matched.firstName })
  response.cookies.set('hospo-worker-session', sessionToken, {
    httpOnly: true,
    secure: workerCookieSecure,
    sameSite: 'lax',
    maxAge: Number(process.env.WORKER_SESSION_EXPIRY_MINUTES ?? 15) * 60,
    path: '/',
  })

  return response
}
