/**
 * Recovers the step-level links that `migrate-to-guides.ts` discarded.
 *
 * That migration flattened StepInventoryItem into the `legacyToolsNote` string
 * and logged every linkedTask / linkedChecklist / StepTask / StepModule as
 * [DROPPED], because GuideStep had nowhere to put them. GuideStepLink now does.
 *
 * The legacy rows are still in the database, so the data is recoverable:
 * migrate-to-guides copied the module id onto the guide verbatim and preserved
 * step `order`, so (guideId == moduleId, order) is a reliable join.
 *
 * Idempotent — a step that already has links is skipped, so this is safe to run
 * on every boot and safe to re-run after a partial failure.
 *
 *   npm run db:migrate-step-links
 */

import { prisma } from '../index'

type LinkRow = {
  stepId: string
  kind: 'ITEM' | 'TASK' | 'CHECKLIST' | 'GUIDE'
  targetId: string
  qty: number | null
  note: string | null
  order: number
}

async function main() {
  const guides = await prisma.guide.findMany({
    select: { id: true, title: true, steps: { select: { id: true, order: true } } },
  })
  if (guides.length === 0) {
    console.log('[step-links] no guides — nothing to do')
    return
  }

  const guideIds = guides.map((g) => g.id)

  // Only legacy modules whose id became a guide id are relevant.
  const modules = await prisma.trainingModule.findMany({
    where: { id: { in: guideIds } },
    select: {
      id: true,
      steps: {
        select: {
          order: true,
          linkedTaskId: true,
          linkedChecklistId: true,
          stepTasks: { select: { taskId: true } },
          stepModules: { select: { moduleId: true } },
          inventoryItems: { select: { itemId: true, quantity: true } },
        },
      },
    },
  })
  if (modules.length === 0) {
    console.log('[step-links] no legacy modules matched — nothing to recover')
    return
  }

  // Skip steps that already carry links so a re-run never duplicates.
  const already = new Set(
    (
      await prisma.guideStepLink.findMany({
        where: { step: { guideId: { in: guideIds } } },
        select: { stepId: true },
        distinct: ['stepId'],
      })
    ).map((l) => l.stepId),
  )

  // Only point GUIDE links at modules that actually became guides.
  const guideIdSet = new Set(guideIds)

  const rows: LinkRow[] = []
  let touchedSteps = 0

  for (const guide of guides) {
    const mod = modules.find((m) => m.id === guide.id)
    if (!mod) continue

    const stepByOrder = new Map(guide.steps.map((s) => [s.order, s.id]))

    for (const legacyStep of mod.steps) {
      const stepId = stepByOrder.get(legacyStep.order)
      if (!stepId || already.has(stepId)) continue

      const seen = new Set<string>()
      let order = 0
      const push = (kind: LinkRow['kind'], targetId: string, qty: number | null = null) => {
        const key = `${kind}:${targetId}`
        if (!targetId || seen.has(key)) return
        seen.add(key)
        rows.push({ stepId, kind, targetId, qty, note: null, order: order++ })
      }

      for (const inv of legacyStep.inventoryItems) {
        push('ITEM', inv.itemId, inv.quantity > 1 ? inv.quantity : null)
      }
      if (legacyStep.linkedTaskId) push('TASK', legacyStep.linkedTaskId)
      for (const st of legacyStep.stepTasks) push('TASK', st.taskId)
      if (legacyStep.linkedChecklistId) push('CHECKLIST', legacyStep.linkedChecklistId)
      for (const sm of legacyStep.stepModules) {
        if (guideIdSet.has(sm.moduleId)) push('GUIDE', sm.moduleId)
      }

      if (order > 0) touchedSteps++
    }
  }

  if (rows.length === 0) {
    console.log('[step-links] nothing to recover')
    return
  }

  // skipDuplicates guards against a target that was hard-deleted and recreated
  // under the same id, which would otherwise trip the unique constraint.
  const created = await prisma.guideStepLink.createMany({ data: rows, skipDuplicates: true })
  console.log(`[step-links] recovered ${created.count} links across ${touchedSteps} steps`)

  // The tools note existed only because links had nowhere to live.
  const cleared = await prisma.guide.updateMany({
    where: { id: { in: guideIds }, legacyToolsNote: { not: null } },
    data: { legacyToolsNote: null },
  })
  if (cleared.count) console.log(`[step-links] cleared ${cleared.count} legacy tool notes`)
}

main()
  .catch((e) => {
    console.error('[step-links] failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
