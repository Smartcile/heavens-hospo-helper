import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { validateBlockPayload, type EventBlockInput } from '@/lib/events.server'
import { loadBlockLibrary } from '@/lib/beo-block-defs.server'

type Params = { params: { id: string } }

function scope(session: { user: { role: string; venueId: string } }) {
  return session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}
}

/** GET /api/admin/event-templates/[id] */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.templates.view')
  if (denied) return denied

  const template = await prisma.beoTemplate.findFirst({
    where: { id: params.id, deletedAt: null, ...scope(session) },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(template)
}

/** PUT /api/admin/event-templates/[id] — built-ins are read-only. */
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.templates.edit')
  if (denied) return denied

  const existing = await prisma.beoTemplate.findFirst({
    where: { id: params.id, deletedAt: null, ...scope(session) },
    select: { id: true, isBuiltIn: true, venueId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.isBuiltIn) {
    return NextResponse.json({ error: 'Built-in templates are read-only' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    data.name = name.toUpperCase()
  }
  if (body.description !== undefined) data.description = (body.description as string) || null
  if (body.category !== undefined) data.category = (body.category as string) || null
  if (body.defaultPax !== undefined) {
    data.defaultPax = body.defaultPax == null ? null : Number(body.defaultPax)
  }
  if (body.defaultStyle !== undefined) data.defaultStyle = (body.defaultStyle as string) || null
  if (body.defaultMenuId !== undefined) data.defaultMenuId = (body.defaultMenuId as string) || null
  if (body.defaultServiceId !== undefined) {
    data.defaultServiceId = (body.defaultServiceId as string) || null
  }
  if (body.defaultSetupId !== undefined) data.defaultSetupId = (body.defaultSetupId as string) || null
  if (body.blocks !== undefined) {
    const blocks = Array.isArray(body.blocks) ? (body.blocks as EventBlockInput[]) : []
    const library = await loadBlockLibrary(existing.venueId ?? session.user.venueId)
    const invalid = validateBlockPayload(blocks, library)
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Unknown block type: ${invalid.join(', ')}` }, { status: 400 })
    }
    data.blocks = blocks
  }

  const template = await prisma.beoTemplate.update({
    where: { id: params.id },
    data: data as Prisma.BeoTemplateUncheckedUpdateInput,
  })
  return NextResponse.json(template)
}

/** DELETE /api/admin/event-templates/[id] — soft delete; built-ins protected. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.templates.delete')
  if (denied) return denied

  const existing = await prisma.beoTemplate.findFirst({
    where: { id: params.id, deletedAt: null, ...scope(session) },
    select: { id: true, isBuiltIn: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.isBuiltIn) {
    return NextResponse.json({ error: 'Built-in templates are read-only' }, { status: 403 })
  }

  await prisma.beoTemplate.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
