import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { validateBlockPayload, type EventBlockInput } from '@/lib/events.server'
import { loadBlockLibrary } from '@/lib/beo-block-defs.server'

/** GET /api/admin/event-templates — venue templates plus built-ins (venueId null). */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.templates.view')
  if (denied) return denied

  const venueId = new URL(req.url).searchParams.get('venueId')
  const visibleVenue = session.user.role === 'MANAGER' ? session.user.venueId : venueId

  const templates = await prisma.beoTemplate.findMany({
    where: {
      deletedAt: null,
      ...(visibleVenue ? { OR: [{ venueId: visibleVenue }, { venueId: null }] } : {}),
    },
    orderBy: [{ isBuiltIn: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(templates)
}

/** POST /api/admin/event-templates — create a template. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.templates.create')
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const venueId = typeof body.venueId === 'string' ? body.venueId : undefined
  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!scopedVenueId) return NextResponse.json({ error: 'Venue is required' }, { status: 400 })

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const blocks = Array.isArray(body.blocks) ? (body.blocks as EventBlockInput[]) : []
  const library = await loadBlockLibrary(scopedVenueId)
  const invalid = validateBlockPayload(blocks, library)
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Unknown block type: ${invalid.join(', ')}` }, { status: 400 })
  }

  const template = await prisma.beoTemplate.create({
    data: {
      venueId: scopedVenueId,
      name: name.toUpperCase(),
      description: (body.description as string | undefined) ?? null,
      category: (body.category as string | undefined) ?? null,
      defaultPax: body.defaultPax == null ? null : Number(body.defaultPax),
      defaultStyle: (body.defaultStyle as string | undefined) ?? null,
      defaultMenuId: (body.defaultMenuId as string | undefined) || null,
      defaultServiceId: (body.defaultServiceId as string | undefined) || null,
      defaultSetupId: (body.defaultSetupId as string | undefined) || null,
      blocks: blocks as unknown as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json(template, { status: 201 })
}
