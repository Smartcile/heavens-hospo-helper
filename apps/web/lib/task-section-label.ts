// Issue #165 — section labels for admin task surfaces. Prisma-free so the
// admin components and their tests share one rule.
//
// A task's primary section is `Task.section` (the relation kept in sync with
// `sectionId`); `sectionIds` carries the full set for multi-section tasks, and
// checklist card tasks carry only a `sectionCount`. The inline prefix always
// names the primary section and counts the extras, so two "TURN ON DISHWASHER"
// rows in different sections are distinguishable even where the
// Department → Section header is off-screen.

export interface TaskSectionInput {
  /** Present on full task rows and checklist card tasks. */
  sectionName?: string | null
  sectionId?: string | null
  sectionIds?: readonly string[] | null
  /** Total section count when the full id list is not available (checklist card). */
  sectionCount?: number | null
  section?: { id?: string; name?: string | null } | null
  department?: { name?: string | null } | null
}

function primarySectionName(task: TaskSectionInput): string | null {
  const name = task.section?.name?.trim() || task.sectionName?.trim()
  return name || null
}

function extraSectionCount(task: TaskSectionInput): number {
  if (task.sectionIds?.length) return Math.max(0, task.sectionIds.length - 1)
  if (typeof task.sectionCount === 'number') return Math.max(0, task.sectionCount - 1)
  return 0
}

function hasSectionRef(task: TaskSectionInput): boolean {
  return (
    !!task.sectionId ||
    (task.sectionIds?.length ?? 0) > 0 ||
    (task.sectionCount ?? 0) > 0
  )
}

/** `[BAR]`, `[BAR +2]`, `[SECTION]` (relation missing) or `[NO SECTION]`. */
export function taskSectionPrefix(task: TaskSectionInput): string {
  const name = primarySectionName(task)
  if (name) {
    const extras = extraSectionCount(task)
    return `[${name.toUpperCase()}${extras > 0 ? ` +${extras}` : ''}]`
  }
  if (hasSectionRef(task)) return '[SECTION]'
  return '[NO SECTION]'
}

/** Plain label for a `title` tooltip: `BAR`, `SECTION` or `NO SECTION`. */
export function taskSectionTitle(task: TaskSectionInput): string {
  const name = primarySectionName(task)
  if (name) return name.toUpperCase()
  if (hasSectionRef(task)) return 'SECTION'
  return 'NO SECTION'
}

export interface TaskSectionGroup<T> {
  label: string
  tasks: T[]
}

/**
 * Group tasks under their own section, ordered by department then section.
 * Tasks whose section relation cannot be resolved share one `SECTION` group,
 * and tasks with no section land in a single `NO SECTION` group, always last.
 */
export function groupTasksBySection<T extends TaskSectionInput>(tasks: readonly T[]): TaskSectionGroup<T>[] {
  const groups = new Map<
    string,
    { label: string; department: string; section: string; none: boolean; tasks: T[] }
  >()

  for (const task of tasks) {
    const name = primarySectionName(task)
    const id = task.section?.id ?? task.sectionIds?.[0] ?? task.sectionId ?? null
    const none = !name && !id
    // A section id with no resolvable name (soft-deleted/missing relation) is
    // not a distinct section — merge them all under the `[SECTION]` fallback.
    const key = none ? '__no_section__' : name ? `section:${id ?? name}` : '__unknown_section__'
    let group = groups.get(key)
    if (!group) {
      group = {
        label: name ? name.toUpperCase() : none ? 'NO SECTION' : 'SECTION',
        department: (task.department?.name ?? '').toUpperCase(),
        section: (name ?? 'SECTION').toUpperCase(),
        none,
        tasks: [],
      }
      groups.set(key, group)
    }
    group.tasks.push(task)
  }

  return [...groups.values()]
    .sort((a, b) => {
      if (a.none !== b.none) return a.none ? 1 : -1
      return a.department.localeCompare(b.department) || a.section.localeCompare(b.section)
    })
    .map(({ label, tasks: groupTasks }) => ({ label, tasks: groupTasks }))
}
