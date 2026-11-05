import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { releaseSnapshot } from '@/lib/release-updates.server'
import { versionMatches } from '@/lib/release-updates'

// Admin-only, one row per request so concurrent tabs cannot clobber each other.
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (session.user.role !== 'ADMIN') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session }
}

/** PUT /api/admin/updates/:issueNumber { version, confirmed, note? } */
export async function PUT(
  req: NextRequest,
  { params }: { params: { issueNumber: string } },
) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const { session } = auth

  const issueNumber = Number(params.issueNumber)
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    return NextResponse.json({ error: 'INVALID ISSUE NUMBER' }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    version?: unknown
    confirmed?: unknown
    note?: unknown
  }
  const version =
    typeof body.version === 'string' && body.version.trim()
      ? body.version.trim()
      : releaseSnapshot.version
  if (!versionMatches(releaseSnapshot.version, version)) {
    return NextResponse.json(
      { error: 'VERSION MISMATCH', version: releaseSnapshot.version },
      { status: 409 },
    )
  }

  const issue = releaseSnapshot.issues.find((row) => row.number === issueNumber)
  if (!issue) {
    return NextResponse.json({ error: 'UNKNOWN ISSUE' }, { status: 404 })
  }

  const confirmed = body.confirmed === true
  const note =
    typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null

  if (!confirmed) {
    await prisma.updateConfirmation.updateMany({
      where: {
        version: releaseSnapshot.version,
        issueNumber,
        staffId: session.user.id,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    })
    return NextResponse.json({ confirmed: false })
  }

  // The unique key spans soft-deleted rows, so an upsert revives rather than
  // colliding with a previous untick.
  const row = await prisma.updateConfirmation.upsert({
    where: {
      version_issueNumber_staffId: {
        version: releaseSnapshot.version,
        issueNumber,
        staffId: session.user.id,
      },
    },
    update: {
      confirmedAt: new Date(),
      deletedAt: null,
      ...(note ? { note } : {}),
    },
    create: {
      version: releaseSnapshot.version,
      issueNumber,
      staffId: session.user.id,
      note,
    },
    select: { issueNumber: true, confirmedAt: true, note: true },
  })

  return NextResponse.json({ confirmed: true, confirmation: row })
}
