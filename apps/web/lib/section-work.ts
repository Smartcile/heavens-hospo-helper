// Section-work eligibility — pure and Prisma-free.
//
// Finishing a section's guides (or its pathway milestone) only RAISES a review.
// It never grants the section. A manager confirms the review, which is the one
// and only path that writes StaffSection.

export type SectionWorkStatus = 'PENDING' | 'CONFIRMED' | 'DISMISSED'
export type SectionWorkSource = 'GUIDES' | 'PATHWAY'

/** The targeting fields of a guide, as loaded for one venue. */
export interface SectionGuideCatalogRow {
  guideId: string
  sectionId: string
  /** GuideStatus — only PUBLISHED counts. */
  status: string
  /** Only tracked guides count; SOPs/FAQs never complete a section. */
  isTracked: boolean
}

export interface SectionGuideProgress {
  /** At least one published, tracked guide targets the section. */
  eligible: boolean
  /** Eligible AND every required guide is complete. Zero guides is never complete. */
  complete: boolean
  requiredGuideIds: string[]
  completedGuideIds: string[]
  missingGuideIds: string[]
}

/** Required / completed / missing section guides for one person. */
export function sectionGuideProgress(
  sectionId: string,
  guides: readonly SectionGuideCatalogRow[],
  completedGuideIds: ReadonlySet<string>,
): SectionGuideProgress {
  const requiredGuideIds = [
    ...new Set(
      guides
        .filter((g) => g.sectionId === sectionId && g.status === 'PUBLISHED' && g.isTracked)
        .map((g) => g.guideId),
    ),
  ].sort()

  const completedGuideIdsForSection = requiredGuideIds.filter((id) => completedGuideIds.has(id))
  const missingGuideIds = requiredGuideIds.filter((id) => !completedGuideIds.has(id))

  return {
    eligible: requiredGuideIds.length > 0,
    complete: requiredGuideIds.length > 0 && missingGuideIds.length === 0,
    requiredGuideIds,
    completedGuideIds: completedGuideIdsForSection,
    missingGuideIds,
  }
}

export interface PathwayProgressLike {
  nodes: readonly { kind: string; status: string }[]
}

/**
 * A pathway counts as complete for section-work purposes once any MILESTONE
 * node is DONE. Pathways store shape, not progress, so this reads the resolved
 * view rather than a separate progress table.
 */
export function isPathwayComplete(view: PathwayProgressLike | null | undefined): boolean {
  return !!view?.nodes.some((n) => n.kind === 'MILESTONE' && n.status === 'DONE')
}

const GUIDES_PREFIX = 'GUIDES:'
const PATHWAY_PREFIX = 'PATHWAY:'

/**
 * Stable evidence signature. Both sources can qualify at once, so both are
 * recorded — a dismissed review reopens when EITHER source changes.
 */
export function combineSectionWorkEvidence(input: {
  guideIds?: readonly string[]
  pathwayId?: string | null
}): string | null {
  const parts: string[] = []
  if (input.guideIds?.length) {
    parts.push(`${GUIDES_PREFIX}${[...input.guideIds].sort().join(',')}`)
  }
  if (input.pathwayId) {
    parts.push(`${PATHWAY_PREFIX}${input.pathwayId}`)
  }
  return parts.length ? parts.join('|') : null
}

export function evidenceGuideIds(evidence: string | null | undefined): string[] {
  if (!evidence) return []
  const part = evidence.split('|').find((p) => p.startsWith(GUIDES_PREFIX))
  if (!part) return []
  return part.slice(GUIDES_PREFIX.length).split(',').filter(Boolean)
}

export function evidencePathwayId(evidence: string | null | undefined): string | null {
  if (!evidence) return null
  const part = evidence.split('|').find((p) => p.startsWith(PATHWAY_PREFIX))
  return part ? part.slice(PATHWAY_PREFIX.length) || null : null
}

/** Human label for the review strip. */
export function describeSectionWorkEvidence(evidence: string | null | undefined): string {
  const guideCount = evidenceGuideIds(evidence).length
  const pathwayId = evidencePathwayId(evidence)
  const parts: string[] = []
  if (pathwayId) parts.push('PATHWAY MILESTONE')
  if (guideCount > 0) parts.push(`${guideCount} GUIDE${guideCount === 1 ? '' : 'S'} COMPLETE`)
  return parts.length ? parts.join(' · ') : 'NO EVIDENCE'
}

/** Primary source badge — a completed milestone wins when both are present. */
export function sectionWorkSourceForEvidence(
  evidence: string | null | undefined,
): SectionWorkSource {
  return evidencePathwayId(evidence) ? 'PATHWAY' : 'GUIDES'
}
