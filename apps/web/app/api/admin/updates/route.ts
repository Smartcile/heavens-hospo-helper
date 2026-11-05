import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { releaseSnapshot } from '@/lib/release-updates.server'
import { releaseProgress, versionMatches } from '@/lib/release-updates'

// Admin-only. The list is global (not venue-scoped), matching Settings → FILES
// and the backup routes rather than the venue-scoped permission guards.
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

/** GET /api/admin/updates?version= — snapshot + this admin's ticks. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const { session } = auth

  const snapshot = releaseSnapshot
  const requested = new URL(req.url).searchParams.get('version')
  if (!versionMatches(snapshot.version, requested)) {
    return NextResponse.json(
      { error: 'VERSION MISMATCH', version: snapshot.version },
      { status: 409 },
    )
  }

  const confirmations = await prisma.updateConfirmation.findMany({
    where: { staffId: session.user.id, version: snapshot.version, deletedAt: null },
    select: { issueNumber: true, confirmedAt: true, note: true },
    orderBy: { issueNumber: 'asc' },
  })

  const delivered = snapshot.issues.filter((issue) => issue.state === 'CLOSED')
  const progress = releaseProgress(
    delivered,
    confirmations.map((row) => row.issueNumber),
  )

  return NextResponse.json({
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    repo: snapshot.repo,
    issues: snapshot.issues,
    confirmations,
    progress,
  })
}
