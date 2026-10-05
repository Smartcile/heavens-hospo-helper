// Role (Position) training requirements — the pure brain behind "is this person
// ready for their role?".
//
// A role requires: some sections the holder must be *fully trained in* (i.e.
// every published guide targeting that section is complete) plus extra required
// guides. The required set is the union, deduped. Prisma-free so the server (the
// authority) and the admin/rōster UI compute the same answer.

export interface SectionGuide {
  guideId: string
  /** A section this guide targets (GuideAudience kind SECTION). */
  sectionId: string
}

export interface RequirementInput {
  /** Extra guides required by the role itself. */
  explicitGuideIds: string[]
  /** Sections the holder must be fully trained in. */
  requiredSectionIds: string[]
  /** Published guides targeting sections — one row per (guide, section). */
  sectionGuides: SectionGuide[]
  completedGuideIds: Iterable<string>
}

export interface SectionRequirementStatus {
  sectionId: string
  guideIds: string[]
  completed: string[]
  missing: string[]
  fullyTrained: boolean
}

export interface PositionReadiness {
  /** The deduped union of explicit + section guides. */
  requiredGuideIds: string[]
  completed: string[]
  missing: string[]
  sections: SectionRequirementStatus[]
  requiredCount: number
  completedCount: number
  percent: number
  ready: boolean
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

/** Every guide a section carries, per section id (deduped). */
export function sectionGuideMap(requiredSectionIds: string[], sectionGuides: SectionGuide[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const id of requiredSectionIds) map.set(id, [])
  for (const sg of sectionGuides) {
    if (!map.has(sg.sectionId)) continue
    const list = map.get(sg.sectionId)!
    if (!list.includes(sg.guideId)) list.push(sg.guideId)
  }
  return map
}

/** The full required-guide set for a role: explicit ∪ every required section's guides. */
export function requiredGuideIds(input: Omit<RequirementInput, 'completedGuideIds'>): string[] {
  const map = sectionGuideMap(input.requiredSectionIds, input.sectionGuides)
  const fromSections = [...map.values()].flat()
  return unique([...input.explicitGuideIds, ...fromSections])
}

/** Resolve a holder's readiness against a role's requirements. */
export function resolveReadiness(input: RequirementInput): PositionReadiness {
  const completed = new Set(input.completedGuideIds)
  const guideMap = sectionGuideMap(input.requiredSectionIds, input.sectionGuides)

  const sections: SectionRequirementStatus[] = input.requiredSectionIds.map((sectionId) => {
    const guideIds = guideMap.get(sectionId) ?? []
    const done = guideIds.filter((id) => completed.has(id))
    const missing = guideIds.filter((id) => !completed.has(id))
    return { sectionId, guideIds, completed: done, missing, fullyTrained: missing.length === 0 }
  })

  const allRequired = requiredGuideIds(input)
  const doneList = allRequired.filter((id) => completed.has(id))
  const missingList = allRequired.filter((id) => !completed.has(id))
  const requiredCount = allRequired.length
  const completedCount = doneList.length

  return {
    requiredGuideIds: allRequired,
    completed: doneList,
    missing: missingList,
    sections,
    requiredCount,
    completedCount,
    percent: requiredCount === 0 ? 100 : Math.round((completedCount / requiredCount) * 100),
    ready: missingList.length === 0,
  }
}

/** One-line summary for a badge. */
export function readinessLabel(r: Pick<PositionReadiness, 'requiredCount' | 'completedCount' | 'ready'>): string {
  if (r.requiredCount === 0) return 'NO REQUIREMENTS'
  return r.ready ? 'READY' : `${r.completedCount}/${r.requiredCount} TRAINED`
}
