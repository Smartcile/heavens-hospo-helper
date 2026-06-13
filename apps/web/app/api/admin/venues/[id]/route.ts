import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const isOwnVenueManager = session.user.role === 'MANAGER' && session.user.venueId === params.id
  if (!isAdmin && !isOwnVenueManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, address, timezone, isActive, loadedRosterUrl, googleCalendarUrl, externalRefreshMinutes } = body

  const data: Record<string, unknown> = {}
  // Integration settings — editable by an admin or the venue's own manager.
  if (loadedRosterUrl !== undefined) data.loadedRosterUrl = loadedRosterUrl?.trim() || null
  if (googleCalendarUrl !== undefined) data.googleCalendarUrl = googleCalendarUrl?.trim() || null
  if (externalRefreshMinutes !== undefined) data.externalRefreshMinutes = Number(externalRefreshMinutes) || 0
  // Core venue fields — admin only.
  if (isAdmin) {
    if (name !== undefined) data.name = String(name).toUpperCase().trim()
    if (address !== undefined) data.address = address?.trim() ?? null
    if (timezone !== undefined) data.timezone = timezone
    if (isActive !== undefined) data.isActive = isActive
  }

  const venue = await prisma.venue.update({ where: { id: params.id }, data })
  return NextResponse.json(venue)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.venue.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ success: true })
}
