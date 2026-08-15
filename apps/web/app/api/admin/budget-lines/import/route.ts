import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Readable } from 'stream'
import readXlsxFile from 'read-excel-file/node'
import { parsePnlRows } from '@/lib/budget-lines-import'
import { guardAccess } from '@/lib/permissions'

const MAX_FILE_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.budget.edit')
  if (denied) return denied

  const body = await req.json()
  const { venueId, year, fileBase64 } = body as { venueId?: string; year: number; fileBase64: string }

  if (session.user.role === 'MANAGER' && venueId && session.user.venueId !== venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!fileBase64 || !year) {
    return NextResponse.json({ error: 'fileBase64 and year are required' }, { status: 400 })
  }

  const buffer = Buffer.from(fileBase64, 'base64')
  if (buffer.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  if (buffer.length > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 413 })
  }

  try {
    const rows = await readXlsxFile(Readable.from(buffer))
    const { months, rows: parsed } = parsePnlRows(rows)
    if (months.length === 0) {
      return NextResponse.json({ error: 'No month columns found — expected a header row of month names' }, { status: 422 })
    }
    return NextResponse.json({
      months,
      year,
      rows: parsed.map((r) => ({
        label: r.label,
        kind: r.kind,
        depth: r.depth,
        values: r.values,
        sectionId: r.sectionId,
        include: r.include,
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Could not read this file — not a valid .xlsx workbook' }, { status: 422 })
  }
}
