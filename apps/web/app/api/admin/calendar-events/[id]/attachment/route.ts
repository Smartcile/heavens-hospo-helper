import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId, getAccessibleVenueIds } from '@/lib/venue-scope'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { storageRoot } from '@/lib/storage'

const MAX_BYTES = 25 * 1024 * 1024

type SessionLike = {
  user: { role: string; venueId: string; availableVenueIds: string[] }
}

async function loadManualEvent(session: SessionLike, req: NextRequest, id: string) {
  const event = await prisma.calendarEvent.findFirst({ where: { id, deletedAt: null } })
  if (!event) return { error: NextResponse.json({ error: 'NOT FOUND' }, { status: 404 }) }
  const managerVenue = getManagerVenueId(session, req)
  if (managerVenue && event.venueId !== managerVenue) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  if (session.user.role !== 'ADMIN' && !getAccessibleVenueIds(session).includes(event.venueId)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  if (event.source !== 'MANUAL') {
    return {
      error: NextResponse.json({ error: 'IMPORTED EVENTS ARE READ-ONLY' }, { status: 400 }),
    }
  }
  return { event }
}

// Upload the event's PDF (run sheet, floor plan, contract…). Stored in
// UPLOAD_PATH and served via /api/upload; the event's pdfPath points at it.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const loaded = await loadManualEvent(session, req, params.id)
  if ('error' in loaded) return loaded.error
  const { event } = loaded

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 })
  }
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'PDF is too large (25MB max)' }, { status: 400 })
  }

  const base = file.name.replace(/[^a-z0-9.]/gi, '_').replace(/\.pdf$/i, '') || 'event'
  const filename = `${crypto.randomUUID()}-${base}.pdf`
  const root = storageRoot()
  await mkdir(root, { recursive: true })
  await writeFile(join(root, filename), Buffer.from(await file.arrayBuffer()))

  const pdfPath = `/api/upload/${filename}`
  await prisma.calendarEvent.update({ where: { id: event.id }, data: { pdfPath } })

  return NextResponse.json({ pdfPath })
}

// Remove the event's uploaded PDF reference (the file itself stays in storage,
// same policy as guide attachments).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const loaded = await loadManualEvent(session, req, params.id)
  if ('error' in loaded) return loaded.error
  const { event } = loaded

  await prisma.calendarEvent.update({ where: { id: event.id }, data: { pdfPath: null } })
  return NextResponse.json({ success: true })
}
