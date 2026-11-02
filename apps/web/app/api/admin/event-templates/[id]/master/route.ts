import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { setMasterTemplate } from '@/lib/enquiries.server'

type Params = { params: { id: string } }

/**
 * PUT /api/admin/event-templates/[id]/master — set (or clear) the venue's
 * enquiry master template. Setting one demotes the incumbent.
 * Body: { isMaster: boolean }.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.templates.edit')
  if (denied) return denied

  const template = await prisma.beoTemplate.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
    },
    select: { id: true, venueId: true, isBuiltIn: true },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (template.isBuiltIn || !template.venueId) {
    return NextResponse.json({ error: 'Built-in templates cannot be the master' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { isMaster?: unknown }
  const isMaster = body.isMaster !== false

  if (!isMaster) {
    await prisma.beoTemplate.update({ where: { id: params.id }, data: { isMaster: false } })
    return NextResponse.json({ ok: true, isMaster: false })
  }

  const updated = await setMasterTemplate(params.id, template.venueId)
  if (!updated) return NextResponse.json({ error: 'Could not set master' }, { status: 400 })
  return NextResponse.json(updated)
}
