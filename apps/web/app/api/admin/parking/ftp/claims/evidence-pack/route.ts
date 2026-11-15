import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { getServerSession } from 'next-auth'
import { PDFDocument } from 'pdf-lib'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { resolveWithinRoot, storageRoot } from '@/lib/storage'

// Merge the selected claims' evidence PDFs into one file the admin can send.
// Claims without a generated PDF are skipped.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const ids = (req.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 100)
  if (ids.length === 0) {
    return NextResponse.json({ error: 'SELECT AT LEAST ONE CLAIM' }, { status: 400 })
  }

  const claims = await prisma.ftpClaim.findMany({
    where: {
      id: { in: ids },
      venueId: scoped.venueId,
      deletedAt: null,
      evidencePdfPath: { not: null },
    },
    select: { id: true, evidencePdfPath: true },
  })
  const byId = new Map(claims.map((claim) => [claim.id, claim.evidencePdfPath]))

  const out = await PDFDocument.create()
  let copied = 0
  for (const id of ids) {
    const relative = byId.get(id)
    if (!relative) continue
    const absolute = resolveWithinRoot(storageRoot(), relative)
    if (!absolute) continue
    try {
      const bytes = await readFile(absolute)
      const source = await PDFDocument.load(bytes)
      const pages = await out.copyPages(source, source.getPageIndices())
      for (const page of pages) out.addPage(page)
      copied += 1
    } catch {
      // Skip a corrupt/missing PDF rather than failing the whole pack.
    }
  }

  if (copied === 0) {
    return NextResponse.json({ error: 'NO EVIDENCE PDFS AVAILABLE FOR THAT SELECTION' }, { status: 404 })
  }

  const bytes = await out.save()
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ftp-evidence-pack-${stamp}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
