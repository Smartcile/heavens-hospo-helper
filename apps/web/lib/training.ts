import { prisma } from '@hospo-ops/db'

export interface StaffTrainingItem {
  id: string
  title: string
  description: string | null
  category: string | null
  requiresSignOff: boolean
  isOnboarding: boolean
  onboardingOrder: number
  department: { id: string; name: string } | null
  linkedTask: { id: string; title: string } | null
  steps: {
    id: string
    order: number
    title: string | null
    content: string
    imageUrl: string | null
    videoUrl: string | null
    linkedChecklist: { id: string; name: string; tasks: { id: string; title: string }[] } | null
  }[]
  source: 'ONBOARDING' | 'DEPARTMENT' | 'ASSIGNED'
  assignmentReason: string | null
  completed: boolean
  completion: {
    completedAt: Date
    selfCompleted: boolean
    signedOffByName: string | null
    note: string | null
  } | null
}

/**
 * Resolve the training applicable to a staff member and their progress.
 * Applicable = onboarding modules (everyone) + department modules + individually
 * assigned modules, all within the staff member's venue.
 */
export async function getStaffTraining(staffId: string): Promise<{
  staff: { id: string; firstName: string; lastName: string; venueId: string; departmentId: string | null }
  items: StaffTrainingItem[]
} | null> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { id: true, firstName: true, lastName: true, venueId: true, departmentId: true },
  })
  if (!staff) return null

  const assignments = await prisma.trainingAssignment.findMany({
    where: { staffId, deletedAt: null },
    select: { moduleId: true, reason: true },
  })
  const assignedIds = assignments.map((a) => a.moduleId)
  const reasonByModule = new Map(assignments.map((a) => [a.moduleId, a.reason]))

  const modules = await prisma.trainingModule.findMany({
    where: {
      venueId: staff.venueId,
      isActive: true,
      deletedAt: null,
      kind: 'TRAINING', // SOP / FAQ / HOWTO are reference material, not "to complete"
      OR: [
        { isOnboarding: true },
        ...(staff.departmentId ? [{ departmentId: staff.departmentId }] : []),
        { id: { in: assignedIds.length ? assignedIds : ['__none__'] } },
      ],
    },
    include: {
      steps: {
        orderBy: { order: 'asc' },
        include: {
          linkedChecklist: {
            select: {
              id: true,
              name: true,
              tasks: { orderBy: { sortOrder: 'asc' }, include: { task: { select: { id: true, title: true, deletedAt: true } } } },
            },
          },
        },
      },
      department: { select: { id: true, name: true } },
      linkedTask: { select: { id: true, title: true } },
    },
    orderBy: [
      { isOnboarding: 'desc' },
      { onboardingOrder: 'asc' },
      { category: 'asc' },
      { title: 'asc' },
    ],
  })

  const completions = await prisma.trainingCompletion.findMany({
    where: { staffId, moduleId: { in: modules.map((m) => m.id) } },
  })
  const completionByModule = new Map(completions.map((c) => [c.moduleId, c]))

  // Resolve sign-off manager names.
  const signOffIds = [...new Set(completions.map((c) => c.signedOffById).filter(Boolean))] as string[]
  const signers = signOffIds.length
    ? await prisma.staff.findMany({
        where: { id: { in: signOffIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : []
  const signerName = new Map(signers.map((s) => [s.id, `${s.firstName} ${s.lastName}`]))

  const items: StaffTrainingItem[] = modules.map((m) => {
    const c = completionByModule.get(m.id)
    const source: StaffTrainingItem['source'] = assignedIds.includes(m.id)
      ? 'ASSIGNED'
      : m.isOnboarding
        ? 'ONBOARDING'
        : 'DEPARTMENT'
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      category: m.category,
      requiresSignOff: m.requiresSignOff,
      isOnboarding: m.isOnboarding,
      onboardingOrder: m.onboardingOrder,
      department: m.department,
      linkedTask: m.linkedTask,
      steps: m.steps.map((s) => ({
        id: s.id,
        order: s.order,
        title: s.title,
        content: s.content,
        imageUrl: s.imageUrl,
        videoUrl: s.videoUrl,
        linkedChecklist: s.linkedChecklist
          ? {
              id: s.linkedChecklist.id,
              name: s.linkedChecklist.name,
              tasks: s.linkedChecklist.tasks
                .filter((ct) => ct.task && !ct.task.deletedAt)
                .map((ct) => ({ id: ct.task.id, title: ct.task.title })),
            }
          : null,
      })),
      source,
      assignmentReason: reasonByModule.get(m.id) ?? null,
      completed: !!c,
      completion: c
        ? {
            completedAt: c.completedAt,
            selfCompleted: c.selfCompleted,
            signedOffByName: c.signedOffById ? signerName.get(c.signedOffById) ?? null : null,
            note: c.note,
          }
        : null,
    }
  })

  return { staff, items }
}

/**
 * Resolve SOP / FAQ / HOWTO reference modules available to a staff member
 * (venue-scoped, department-scoped, or venue-wide). These are reference
 * material — no completion tracking, no assignment — used for the SOPs page.
 */
export async function getStaffSops(staffId: string): Promise<{
  items: Pick<StaffTrainingItem, 'id' | 'title' | 'description' | 'category' | 'steps' | 'department'>[]
} | null> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { id: true, firstName: true, lastName: true, venueId: true, departmentId: true },
  })
  if (!staff) return null

  const modules = await prisma.trainingModule.findMany({
    where: {
      venueId: staff.venueId,
      isActive: true,
      deletedAt: null,
      kind: { in: ['SOP', 'FAQ', 'HOWTO'] },
      OR: [
        { departmentId: null },
        ...(staff.departmentId ? [{ departmentId: staff.departmentId }] : []),
      ],
    },
    include: {
      steps: {
        orderBy: { order: 'asc' },
        include: {
          linkedChecklist: {
            select: {
              id: true,
              name: true,
              tasks: {
                orderBy: { sortOrder: 'asc' },
                include: { task: { select: { id: true, title: true, deletedAt: true } } },
              },
            },
          },
        },
      },
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ category: 'asc' }, { title: 'asc' }],
  })

  const items = modules.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    category: m.category,
    department: m.department,
    steps: m.steps.map((s) => ({
      id: s.id,
      order: s.order,
      title: s.title,
      content: s.content,
      imageUrl: s.imageUrl,
      videoUrl: s.videoUrl,
      linkedChecklist: s.linkedChecklist
        ? {
            id: s.linkedChecklist.id,
            name: s.linkedChecklist.name,
            tasks: s.linkedChecklist.tasks
              .filter((ct) => ct.task && !ct.task.deletedAt)
              .map((ct) => ({ id: ct.task.id, title: ct.task.title })),
          }
        : null,
    })),
  }))

  return { items }
}
