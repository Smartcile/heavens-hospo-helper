import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayManageEvents } from '@/lib/worker-event-access'
import { buildBeoPdfData } from '@/lib/events.server'
import { beoPdfFilename, beoPdfToBuffer, generateBeoPdf, type BeoPdfVariant } from '@/lib/beo-pdf'

type Params = { params: { id: string } }

const VARIANTS: BeoPdfVariant[] = ['FULL', 'CLIENT', 'KITCHEN']

function variantFrom(req: NextRequest): BeoPdfVariant {
  const raw = (new URL(req.url).searchParams.get('variant') ?? 'FULL').toUpperCase()
  return (VARIANTS as string[]).includes(raw) ? (raw as BeoPdfVariant) : 'FULL'
}

/** GET /api/worker/events/[id]/pdf?variant=full|client|kitchen */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!(await workerMayManageEvents(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const data = await buildBeoPdfData(params.id, session!.venueId)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const variant = variantFrom(req)
  const buffer = beoPdfToBuffer(generateBeoPdf(data, variant))

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${beoPdfFilename(data.eventName, variant)}"`,
    },
  })
}
