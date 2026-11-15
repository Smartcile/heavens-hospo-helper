import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { normaliseFtpTypeInput } from '@/lib/ftp-parking'
import { hashAdminPin } from '@/lib/ftp-credentials.server'
import { ftpTypeAdminView } from '@/lib/ftp-admin-views'
import { pinHint } from '@/lib/vpermit'

async function load(req: NextRequest, id: string) {
  const session = await getServerSession(authOptions)
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const row = await prisma.ftpParkingType.findFirst({
    where: { id, venueId: scoped.venueId, deletedAt: null },
  })
  if (!row) return { error: NextResponse.json({ error: 'NOT FOUND' }, { status: 404 }) }
  return { session, venueId: scoped.venueId, row }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const loaded = await load(req, params.id)
  if ('error' in loaded) return loaded.error
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const input = normaliseFtpTypeInput(body)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 422 })

  const enabling = input.value.adminPinEnabled
  const newPin = input.value.adminPin
  if (enabling && !newPin && !loaded.row.adminPinHash) {
    return NextResponse.json(
      { error: 'SET AN ADMIN PIN BEFORE ENABLING IT' },
      { status: 422 },
    )
  }

  const duplicate = await prisma.ftpParkingType.findFirst({
    where: {
      venueId: loaded.venueId,
      name: input.value.name,
      deletedAt: null,
      NOT: { id: loaded.row.id },
    },
    select: { id: true },
  })
  if (duplicate) {
    return NextResponse.json({ error: 'A PARKING TYPE WITH THAT NAME ALREADY EXISTS' }, { status: 409 })
  }

  const row = await prisma.ftpParkingType.update({
    where: { id: loaded.row.id },
    data: {
      name: input.value.name,
      windowLabel: input.value.windowLabel,
      durationMinutes: input.value.durationMinutes,
      claimUrl: input.value.claimUrl,
      claimCode: input.value.claimCode,
      contactName: input.value.contactName,
      contactEmail: input.value.contactEmail,
      contactPhone: input.value.contactPhone,
      logPlates: input.value.logPlates,
      adminPinEnabled: input.value.adminPinEnabled,
      ...(newPin
        ? { adminPinHash: await hashAdminPin(newPin), adminPinHint: pinHint(newPin) }
        : {}),
      healthCheckMode: input.value.healthCheckMode,
      healthPlate: input.value.healthPlate,
      sortOrder: input.value.sortOrder,
      notes: input.value.notes,
      isActive: input.value.isActive,
    },
  })
  return NextResponse.json({ type: ftpTypeAdminView(row) })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const loaded = await load(req, params.id)
  if ('error' in loaded) return loaded.error
  await prisma.ftpParkingType.update({
    where: { id: loaded.row.id },
    data: { deletedAt: new Date(), isActive: false },
  })
  return NextResponse.json({ ok: true })
}
