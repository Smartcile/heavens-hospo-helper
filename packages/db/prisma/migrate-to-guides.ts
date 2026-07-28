import { prisma } from '../index'

async function main() {
  console.log('=== GUIDE MIGRATION — DRAFT MODE ===')
  console.log(`Started: ${new Date().toISOString()}\n`)

  const droppedLogs: string[] = []

  // Idempotent guard — safe to run in start.ps1 every boot.
  const alreadyMigrated = await prisma.guide.count()
  if (alreadyMigrated > 0) {
    console.log(`Guides already migrated (${alreadyMigrated} rows). Nothing to do.`)
    await prisma.$disconnect()
    return
  }

  /*
   * Pull all old data in one round-trip.
   * We read first, then write — keeps the transaction window tight.
   */
  const modules = await prisma.trainingModule.findMany({
    include: {
      steps: {
        orderBy: { order: 'asc' },
        include: {
          inventoryItems: { include: { item: { select: { name: true } } } },
          stepTasks:      { include: { task:  { select: { id: true, title: true } } } },
          stepModules:    { include: { module: { select: { id: true, title: true } } } },
        },
      },
      moduleTasks:     true,   // ModuleTask rows (general how-to links)
      requiredByTasks: true,   // TaskRequiredTraining rows (competency links)
    },
  })

  if (modules.length === 0) {
    console.log('No TrainingModule rows found. Nothing to migrate.')
    await prisma.$disconnect()
    return
  }

  /*
   * Pre-fetch names for logging — avoids N+1 lookups inside the transaction.
   */
  const linkedTaskIds  = [...new Set(modules.map((m) => m.linkedTaskId).filter(Boolean) as string[])]
  const linkedCheckIds = [...new Set(modules.flatMap((m) => m.steps.map((s) => s.linkedChecklistId)).filter(Boolean) as string[])]
  const stepTaskIds    = [...new Set(modules.flatMap((m) => m.steps.flatMap((s) => s.stepTasks.map((st) => st.taskId))))]
  const stepModuleIds  = [...new Set(modules.flatMap((m) => m.steps.flatMap((s) => s.stepModules.map((sm) => sm.moduleId))))]

  const [taskTitles, checklistNames, moduleTitles] = await Promise.all([
    linkedTaskIds.length > 0 || stepTaskIds.length > 0
      ? prisma.task.findMany({
          where: { id: { in: [...linkedTaskIds, ...stepTaskIds] } },
          select: { id: true, title: true },
        }).then((rows) => new Map(rows.map((r) => [r.id, r.title])))
      : Promise.resolve(new Map<string, string>()),
    linkedCheckIds.length > 0
      ? prisma.checklist.findMany({
          where: { id: { in: linkedCheckIds } },
          select: { id: true, name: true },
        }).then((rows) => new Map(rows.map((r) => [r.id, r.name])))
      : Promise.resolve(new Map<string, string>()),
    stepModuleIds.length > 0
      ? prisma.trainingModule.findMany({
          where: { id: { in: stepModuleIds } },
          select: { id: true, title: true },
        }).then((rows) => new Map(rows.map((r) => [r.id, r.title])))
      : Promise.resolve(new Map<string, string>()),
  ])

  // ── Core migration inside a single transaction ────────────────────────
  await prisma.$transaction(async (tx) => {
    for (const mod of modules) {
      /*
       * 1. Build legacyToolsNote from StepInventoryItem rows.
       *    Deduplicate by item name — same tool on multiple steps = one entry.
       */
      const toolEntries = new Map<string, number>()
      for (const step of mod.steps) {
        for (const si of step.inventoryItems) {
          const current = toolEntries.get(si.item.name) ?? 0
          toolEntries.set(si.item.name, current + si.quantity)
        }
      }
      const legacyToolsNote =
        toolEntries.size > 0
          ? 'Legacy Tools: ' +
            [...toolEntries.entries()]
              .map(([name, qty]) => `${name} (x${qty})`)
              .join(', ')
          : null

      // 2. isTracked — true ONLY for old TRAINING kind
      const isTracked = mod.kind === 'TRAINING'

      // 3. Insert Guide — status is ALWAYS DRAFT so nothing goes live
      await tx.guide.create({
        data: {
          id: mod.id,                     // preserve original UUID
          title: mod.title,
          description: mod.description,
          category: mod.category,
          venueId: mod.venueId,
          departmentId: mod.departmentId,
          status: 'DRAFT',                // ← DRAFT MODE: sandboxed
          isTracked,
          isOnboarding: mod.isOnboarding,
          requiresSignOff: mod.requiresSignOff,
          legacyToolsNote,
          createdAt: mod.createdAt,
          updatedAt: mod.updatedAt,
          deletedAt: mod.deletedAt,       // preserve soft-delete state
        },
      })

      // 4. Insert GuideSteps — stripped of all junction data
      for (const step of mod.steps) {
        await tx.guideStep.create({
          data: {
            id: step.id,
            guideId: mod.id,
            order: step.order,
            heading: step.title,          // old "title" → new "heading"
            content: step.content,
            imageUrl: step.imageUrl,
            videoUrl: step.videoUrl,
            createdAt: step.createdAt,
            updatedAt: step.updatedAt,
          },
        })

        // ── Log dropped step‑level links ────────────────────────────────
        const stepLabel = step.title || `(step ${step.order})`

        if (step.linkedTaskId) {
          const name = taskTitles.get(step.linkedTaskId) ?? step.linkedTaskId
          droppedLogs.push(
            `[DROPPED] Guide "${mod.title}" → step "${stepLabel}": linkedTask → "${name}"`,
          )
        }
        if (step.linkedChecklistId) {
          const name = checklistNames.get(step.linkedChecklistId) ?? step.linkedChecklistId
          droppedLogs.push(
            `[DROPPED] Guide "${mod.title}" → step "${stepLabel}": linkedChecklist → "${name}"`,
          )
        }
        for (const st of step.stepTasks) {
          const name = taskTitles.get(st.taskId) ?? st.taskId
          droppedLogs.push(
            `[DROPPED] Guide "${mod.title}" → step "${stepLabel}": StepTask → "${name}"`,
          )
        }
        for (const sm of step.stepModules) {
          const name = moduleTitles.get(sm.moduleId) ?? sm.moduleId
          droppedLogs.push(
            `[DROPPED] Guide "${mod.title}" → step "${stepLabel}": StepModule → "${name}"`,
          )
        }
      }

      /*
       * 5. TaskGuide — merge ModuleTask + TaskRequiredTraining + linkedTaskId.
       *    Deduplicate by taskId.  isRequiredForCompetency = true wins on overlap.
       */
      const taskMap = new Map<string, boolean>()

      // ModuleTask → NOT required (general how‑to link)
      for (const mt of mod.moduleTasks) {
        if (!taskMap.has(mt.taskId)) {
          taskMap.set(mt.taskId, false)
        }
      }

      // linkedTaskId (ModuleLinkedTask) → NOT required (this guide IS for this task)
      if (mod.linkedTaskId) {
        if (!taskMap.has(mod.linkedTaskId)) {
          taskMap.set(mod.linkedTaskId, false)
        }
      }

      // TaskRequiredTraining → IS required (competency) — overwrites any false
      for (const tr of mod.requiredByTasks) {
        taskMap.set(tr.taskId, true)
      }

      // Create one TaskGuide row per unique taskId
      for (const [taskId, isRequired] of taskMap) {
        await tx.taskGuide.create({
          data: {
            taskId,
            guideId: mod.id,
            isRequiredForCompetency: isRequired,
          },
        })
      }
    }

    // ── Summary counts ──────────────────────────────────────────────────
    const [guideCount, stepCount, tgCount] = await Promise.all([
      tx.guide.count(),
      tx.guideStep.count(),
      tx.taskGuide.count(),
    ])
    console.log(
      `Migrated: ${guideCount} guides, ${stepCount} steps, ${tgCount} task-guide links`,
    )
  })

  // ── Print dropped‑data report ─────────────────────────────────────────
  if (droppedLogs.length > 0) {
    console.log(`\n=== DROPPED STEP‑LEVEL LINKS (${droppedLogs.length}) ===`)
    for (const log of droppedLogs) console.log(log)
    console.log(
      '\nThese were step‑level junctions that no longer exist.  Re‑attach them at the\nGuide level using the new TaskGuide table if needed.',
    )
  } else {
    console.log('\n(No step‑level links were dropped)')
  }

  // ── Draft‑mode assurance summary ──────────────────────────────────────
  console.log('\n=== DRAFT MODE CONFIRMATION ===')
  console.log('✓ All guides created with status = DRAFT')
  console.log('✓ No TrainingAssignments or TrainingCompletions were touched')
  console.log('✓ No FollowUps were generated')
  console.log('✓ Step‑level inventory data stored in Guide.legacyToolsNote')
  console.log('✓ Old TrainingModule / TrainingStep / junction tables are intact')
  console.log('\n→ Review guides in the admin UI.  Set status to PUBLISHED when ready.')
  console.log('→ Old tables can be archived once the new workflow is proven.')
}

main()
  .catch((e) => {
    console.error('\n❌ Migration failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
