import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { resolveAvailabilityPresets, parseAvailabilityCutoff } from '@/lib/availability'
import { parseVenueWorkerSessionMinutes } from '@/lib/worker-session-timeout'

interface Params {
  params: { id: string }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const isOwnVenueManager = session.user.role === 'MANAGER' && (
    session.user.venueId === params.id ||
    (session.user.availableVenueIds ?? []).includes(params.id)
  )
  if (!isAdmin && !isOwnVenueManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, address, timezone, isActive, loadedRosterUrl, googleCalendarUrl, icalFeedUrl, swiftPosBaseUrl, externalRefreshMinutes, availabilityLockDays, availabilityCutoff, availabilityPresets, workerSessionTimeoutMinutes, sharingEnabled, sharedWooVenueId } = body

  const data: Record<string, unknown> = {}
  // Integration settings — editable by an admin or the venue's own manager.
  if (loadedRosterUrl !== undefined) data.loadedRosterUrl = loadedRosterUrl?.trim() || null
  if (googleCalendarUrl !== undefined) data.googleCalendarUrl = googleCalendarUrl?.trim() || null
  if (icalFeedUrl !== undefined) data.icalFeedUrl = icalFeedUrl?.trim() || null
  // SwiftDOSnet base URL — the SwiftPOS sales feed that drives consumption.
  if (swiftPosBaseUrl !== undefined) data.swiftPosBaseUrl = swiftPosBaseUrl?.trim() || null
  if (externalRefreshMinutes !== undefined) data.externalRefreshMinutes = Number(externalRefreshMinutes) || 0
  // Roster availability cut-off (0 = no lock) — admin or the venue's manager.
  if (availabilityLockDays !== undefined) data.availabilityLockDays = Math.max(0, Math.floor(Number(availabilityLockDays) || 0))
  // Weekly request deadline (null = no deadline) — validated against the
  // weekday range + 15-minute grid.
  if (availabilityCutoff !== undefined) {
    const parsed = parseAvailabilityCutoff(availabilityCutoff)
    data.availabilityCutoff = parsed ? (parsed as unknown as Prisma.InputJsonValue) : Prisma.DbNull
  }
  // Morning/afternoon/evening quick-pick windows — validated against the
  // 15-minute grid so a bad payload can never poison the worker editor.
  if (availabilityPresets !== undefined) {
    data.availabilityPresets = resolveAvailabilityPresets(availabilityPresets) as unknown as Prisma.InputJsonValue
  }
  // Worker phone-session idle timeout. Blank / 0 / null = env fallback;
  // non-numeric input is rejected (400) and other numbers are clamped to the
  // supported 5–480 minute window.
  if (workerSessionTimeoutMinutes !== undefined) {
    const parsed = parseVenueWorkerSessionMinutes(workerSessionTimeoutMinutes)
    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'Worker session timeout must be a number between 5 and 480' },
        { status: 400 }
      )
    }
    data.workerSessionTimeoutMinutes = parsed.minutes
  }
  // Venue sharing settings
  if (sharingEnabled !== undefined) data.sharingEnabled = sharingEnabled
  if (sharedWooVenueId !== undefined) {
    if (sharedWooVenueId && sharedWooVenueId !== params.id) {
      // Validate that the source venue exists, is active, and has sharing enabled
      const source = await prisma.venue.findFirst({
        where: { id: sharedWooVenueId, deletedAt: null, isActive: true, sharingEnabled: true },
        select: { id: true },
      })
      if (!source) {
        return NextResponse.json({ error: 'Source venue not found, inactive, or sharing not enabled' }, { status: 400 })
      }
      data.sharedWooVenueId = sharedWooVenueId
    } else {
      data.sharedWooVenueId = null
    }
  }
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
