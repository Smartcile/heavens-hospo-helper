import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import bcrypt from 'bcryptjs'
import { createWorkerSession, setWorkerSessionCookie } from '@/lib/worker-session'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, pin } = body

  if (!token || !pin) {
    return NextResponse.json({ error: 'Token and PIN required' }, { status: 400 })
  }

  // Validate QR token
  const qrCode = await prisma.qRCode.findFirst({
    where: { token, isActive: true, deletedAt: null },
    include: {
      venue: true,
      department: true,
    },
  })

  if (!qrCode) {
    return NextResponse.json({ error: 'INVALID OR EXPIRED QR CODE' }, { status: 401 })
  }

  // Find staff matching PIN in this venue (and optionally department)
  const staffList = await prisma.staff.findMany({
    where: {
      venueId: qrCode.venueId,
      isActive: true,
      deletedAt: null,
      ...(qrCode.departmentId ? { departmentId: qrCode.departmentId } : {}),
    },
  })

  let matched: typeof staffList[0] | null = null
  for (const staff of staffList) {
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
    venueId: qrCode.venueId,
    departmentId: qrCode.departmentId,
    firstName: matched.firstName,
  })

  const response = NextResponse.json({ success: true, firstName: matched.firstName })
  response.cookies.set('hospo-worker-session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: Number(process.env.WORKER_SESSION_EXPIRY_MINUTES ?? 15) * 60,
    path: '/',
  })

  return response
}
