import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const demoVenue = await prisma.venue.findFirst({
    where: { isDemo: true, deletedAt: null },
    select: { id: true, name: true, isActive: true },
  })

  return NextResponse.json({ venue: demoVenue })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { isActive } = body
  if (typeof isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive (boolean) required' }, { status: 400 })
  }

  const demoVenue = await prisma.venue.findFirst({
    where: { isDemo: true, deletedAt: null },
  })
  if (!demoVenue) {
    return NextResponse.json({ error: 'Demo venue not found' }, { status: 404 })
  }

  const updated = await prisma.venue.update({
    where: { id: demoVenue.id },
    data: { isActive },
  })

  return NextResponse.json({ venue: { id: updated.id, name: updated.name, isActive: updated.isActive } })
}
