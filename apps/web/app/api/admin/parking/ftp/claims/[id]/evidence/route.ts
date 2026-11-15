import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { resolveWithinRoot, storageRoot } from '@/lib/storage'

// Private evidence download for one claim. The PDF/screenshot/HTML live under
// UPLOAD_PATH and are never exposed through the public upload route.

type Format = 'pdf' | 'png' | 'html'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const claim = await prisma.ftpClaim.findFirst({
    where: { id: params.id, venueId: scoped.venueId, deletedAt: null },
    select: {
      id: true,
      evidencePdfPath: true,
      evidenceImagePath: true,
      evidenceHtmlPath: true,
    },
  })
  if (!claim) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })

  const formatRaw = req.nextUrl.searchParams.get('format') ?? 'pdf'
  const format: Format =
    formatRaw === 'png' || formatRaw === 'html' ? formatRaw : 'pdf'
  const relative =
    format === 'png'
      ? claim.evidenceImagePath
      : format === 'html'
        ? claim.evidenceHtmlPath
        : claim.evidencePdfPath
  if (!relative) return NextResponse.json({ error: 'NO EVIDENCE FORMAT AVAILABLE' }, { status: 404 })

  const absolute = resolveWithinRoot(storageRoot(), relative)
  if (!absolute) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })

  let data: Buffer
  try {
    data = await readFile(absolute)
  } catch {
    return NextResponse.json({ error: 'EVIDENCE FILE IS MISSING' }, { status: 404 })
  }

  const ext = format === 'png' ? 'png' : format === 'html' ? 'txt' : 'pdf'
  const contentType =
    format === 'png'
      ? 'image/png'
      : format === 'html'
        ? 'text/plain; charset=utf-8'
        : 'application/pdf'
  const disposition = format === 'html' ? 'attachment' : 'inline'

  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="ftp-claim-${claim.id}.${ext}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
