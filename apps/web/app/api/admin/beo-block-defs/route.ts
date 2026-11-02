import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { buildCustomDefData, loadCustomDefRows } from '@/lib/beo-block-defs.server'

/**
 * GET  /api/admin/beo-block-defs?venueId= — this venue's custom block defs.
 * POST /api/admin/beo-block-defs         — create a custom block def.
 *
 * The client merges these onto the built-ins with `mergeLibrary`; the built-ins
 * themselves are never stored or sent.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.blocks')
  if (denied) return denied

  const params = new URL(req.url).searchParams
  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : params.get('venueId') ?? session.user.venueId

  if (!venueId) return NextResponse.json({ error: 'Venue is required' }, { status: 400 })

  const defs = await loadCustomDefRows(venueId)
  return NextResponse.json(defs)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.blocks')
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : typeof body.venueId === 'string'
        ? body.venueId
        : session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'Venue is required' }, { status: 400 })

  const { data, error } = buildCustomDefData(body, { requireKey: true })
  if (error) return NextResponse.json({ error }, { status: 400 })

  try {
    const def = await prisma.beoBlockDef.create({
      data: {
        ...(data as Prisma.BeoBlockDefUncheckedCreateInput),
        key: String(data.key),
        label: String(data.label),
        venueId,
      },
    })
    return NextResponse.json(def, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: `${data.key} already exists for this venue` }, { status: 409 })
    }
    throw e
  }
}
