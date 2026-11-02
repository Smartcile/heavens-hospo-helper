import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { createTemplateFromEvent } from '@/lib/events.server'

/**
 * POST /api/admin/event-templates/from-event — save an event AS a template.
 * Body: { eventId, venueId?, name, category?, description? }.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.templates.create')
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const eventId = typeof body.eventId === 'string' ? body.eventId : ''
  if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 })

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : (typeof body.venueId === 'string' ? body.venueId : session.user.venueId)

  const template = await createTemplateFromEvent(eventId, venueId, {
    name,
    category: (body.category as string | undefined) ?? null,
    description: (body.description as string | undefined) ?? null,
  })
  if (!template) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  return NextResponse.json(template, { status: 201 })
}
