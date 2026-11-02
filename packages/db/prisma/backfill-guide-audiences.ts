/**
 * Copies the legacy single `Guide.departmentId` into a GuideAudience row.
 *
 * `departmentId` could only ever name one department and could not reach a
 * section or a position. GuideAudience replaces it. The column stays on the
 * model (and is still honoured by the resolver) so nothing breaks mid-rollout,
 * but every guide should also have the equivalent audience row.
 *
 * Idempotent — the unique key is [guideId, kind, targetId], and createMany runs
 * with skipDuplicates.
 *
 *   npm run db:backfill-guide-audiences
 */

import { prisma } from '../index'

async function main() {
  const guides = await prisma.guide.findMany({
    where: { deletedAt: null, departmentId: { not: null } },
    select: { id: true, departmentId: true },
  })
  if (guides.length === 0) {
    console.log('[guide-audiences] nothing to backfill')
    return
  }

  // Skip departments that have since been deleted — an audience pointing at a
  // dead department would just never match.
  const deptIds = [...new Set(guides.map((g) => g.departmentId!))]
  const liveDepts = new Set(
    (
      await prisma.department.findMany({
        where: { id: { in: deptIds }, deletedAt: null },
        select: { id: true },
      })
    ).map((d) => d.id),
  )

  const rows = guides
    .filter((g) => liveDepts.has(g.departmentId!))
    .map((g) => ({ guideId: g.id, kind: 'DEPARTMENT' as const, targetId: g.departmentId! }))

  const created = await prisma.guideAudience.createMany({ data: rows, skipDuplicates: true })
  console.log(`[guide-audiences] created ${created.count} audience rows (${rows.length} candidates)`)
}

main()
  .catch((e) => {
    console.error('[guide-audiences] failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
