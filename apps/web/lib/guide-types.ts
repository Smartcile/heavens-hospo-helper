// The fixed guide taxonomy (mirrors the Prisma `GuideType` enum). Kept pure and
// Prisma-free so the admin form, worker editor and lists all render the same
// labels. `category` remains free-text grouping on top of this.

export type GuideType = 'HOW_TO' | 'SOP' | 'FAQ' | 'TRAINING' | 'POLICY' | 'OTHER' | 'PRODUCT_REFERENCE'

export const GUIDE_TYPES: GuideType[] = ['HOW_TO', 'SOP', 'FAQ', 'TRAINING', 'POLICY', 'OTHER', 'PRODUCT_REFERENCE']

export const GUIDE_TYPE_LABELS: Record<GuideType, string> = {
  HOW_TO: 'HOW TO',
  SOP: 'SOP',
  FAQ: 'FAQ',
  TRAINING: 'TRAINING',
  POLICY: 'POLICY',
  OTHER: 'OTHER',
  PRODUCT_REFERENCE: 'PRODUCT REFERENCE',
}

/** A product-reference guide renders a table, not steps. */
export function isProductReference(value: string | null | undefined): boolean {
  return value === 'PRODUCT_REFERENCE'
}

export function isGuideType(value: unknown): value is GuideType {
  return typeof value === 'string' && (GUIDE_TYPES as string[]).includes(value)
}

/** Human label for a stored type, or null when unset/unknown. */
export function guideTypeLabel(value: string | null | undefined): string | null {
  return isGuideType(value) ? GUIDE_TYPE_LABELS[value] : null
}
