import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { normalisePlate } from '@/lib/parking'
import { plateSubmissionError } from '@/lib/staff-parking'
import { ftpSettingsView } from '@/lib/ftp-settings'

// Staff number plates are worker-app only (their own phone/PIN session), never
// the shared customer kiosk. Every add/change becomes a manager-approved request.

export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await prisma.ftpSettings.findUnique({
    where: { venueId: session.venueId },
  })
  const enabled = Boolean(settings && !settings.deletedAt && settings.staffParkingEnabled)
  if (!enabled) return NextResponse.json({ enabled: false })

  const [plates, requests] = await Promise.all([
    prisma.staffParkingPlate.findMany({
      where: { venueId: session.venueId, staffId: session.staffId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.staffParkingPlateRequest.findMany({
      where: { venueId: session.venueId, staffId: session.staffId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  const view = ftpSettingsView(settings)
  return NextResponse.json({
    enabled: true,
    plates,
    requests,
    settings: {
      name: view.staffCarparkName,
      notes: view.staffCarparkNotes,
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await prisma.ftpSettings.findUnique({
    where: { venueId: session.venueId },
  })
  if (!settings || settings.deletedAt || !settings.staffParkingEnabled) {
    return NextResponse.json({ error: 'STAFF PARKING IS NOT ENABLED' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const plate = normalisePlate(typeof body.licensePlate === 'string' ? body.licensePlate : '')
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const replacePlateId =
    typeof body.replacePlateId === 'string' && body.replacePlateId ? body.replacePlateId : null

  const [activePlates, pending, owners] = await Promise.all([
    prisma.staffParkingPlate.findMany({
      where: { venueId: session.venueId, staffId: session.staffId, deletedAt: null },
      select: { id: true, plate: true, status: true },
    }),
    prisma.staffParkingPlateRequest.findMany({
      where: {
        venueId: session.venueId,
        staffId: session.staffId,
        status: 'PENDING',
        deletedAt: null,
      },
      select: { plate: true },
    }),
    prisma.staffParkingPlate.findMany({
      where: { venueId: session.venueId, plate, status: 'ACTIVE', deletedAt: null },
      select: { staffId: true, plate: true },
    }),
  ])

  let previousPlate: string | null = null
  if (replacePlateId) {
    const target = activePlates.find(
      (row) => row.id === replacePlateId && row.status === 'ACTIVE',
    )
    if (!target) {
      return NextResponse.json({ error: 'PLATE TO CHANGE NOT FOUND' }, { status: 404 })
    }
    previousPlate = target.plate
    if (normalisePlate(target.plate) === plate) {
      return NextResponse.json({ error: 'THAT IS ALREADY THIS PLATE' }, { status: 422 })
    }
  }

  const error = plateSubmissionError({
    plate,
    reason,
    activePlates: activePlates.filter((row) => row.status === 'ACTIVE'),
    pendingPlates: pending.map((row) => row.plate),
    otherOwners: owners,
    staffId: session.staffId,
  })
  if (error) return NextResponse.json({ error }, { status: 422 })

  const request = await prisma.staffParkingPlateRequest.create({
    data: {
      venueId: session.venueId,
      staffId: session.staffId,
      plate,
      previousPlate,
      reason: reason || null,
      status: 'PENDING',
    },
  })

  return NextResponse.json({ request })
}
