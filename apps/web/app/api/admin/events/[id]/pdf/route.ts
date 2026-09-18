import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { buildBeoPdfData } from '@/lib/events.server'
import { loadBlockLibrary } from '@/lib/beo-block-defs.server'
import { beoPdfFilename, beoPdfToBuffer, generateBeoPdf, type BeoPdfVariant } from '@/lib/beo-pdf'

type Params = { params: { id: string } }

const VARIANTS: BeoPdfVariant[] = ['FULL', 'CLIENT', 'KITCHEN']

function variantFrom(req: NextRequest): BeoPdfVariant {
  const raw = (new URL(req.url).searchParams.get('variant') ?? 'FULL').toUpperCase()
  return (VARIANTS as string[]).includes(raw) ? (raw as BeoPdfVariant) : 'FULL'
}

/** GET /api/admin/events/[id]/pdf?variant=full|client|kitchen */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.view')
  if (denied) return denied

  const event = await prisma.event.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
    },
    select: { venueId: true },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data = await buildBeoPdfData(params.id, event.venueId)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const variant = variantFrom(req)
  const library = await loadBlockLibrary(event.venueId)
  const buffer = beoPdfToBuffer(generateBeoPdf(data, variant, library))

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${beoPdfFilename(data.eventName, variant)}"`,
    },
  })
}
