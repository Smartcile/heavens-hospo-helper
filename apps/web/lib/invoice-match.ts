// Pure supplier-invoice line matching. No Prisma imports.

import {
  findSimilar,
  levenshteinRatio,
  tokenJaccard,
  SIMILAR_JACCARD,
  SIMILAR_LEVENSHTEIN,
} from './import/similarity'

export type InvoiceMatchStatus = 'MATCHED' | 'NEW' | 'AMBIGUOUS'
export type InvoiceMatchReason = 'SKU' | 'ALIAS' | 'FUZZY' | 'NONE'

export type MatchCandidate = {
  id: string
  name: string
}

export type MatchInput = {
  description: string
  supplierSku?: string | null
}

export type MatchContext = {
  bySku: Map<string, string>
  aliases: Map<string, string>
  items: MatchCandidate[]
}

export type InvoiceLineMatch = {
  inventoryItemId?: string
  status: InvoiceMatchStatus
  reason: InvoiceMatchReason
}

const SIMILAR_EPSILON = 1e-9

export function normaliseInvoiceText(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fuzzyScore(name: string, candidate: string): number | null {
  const jaccard = tokenJaccard(name, candidate)
  const ratio = levenshteinRatio(name, candidate)
  if (jaccard < SIMILAR_JACCARD && ratio < SIMILAR_LEVENSHTEIN) return null
  return Math.max(jaccard, ratio)
}

export function matchInvoiceLine(input: MatchInput, ctx: MatchContext): InvoiceLineMatch {
  const skuKey = normaliseInvoiceText(input.supplierSku)
  if (skuKey) {
    const bySku = ctx.bySku.get(skuKey)
    if (bySku) return { inventoryItemId: bySku, status: 'MATCHED', reason: 'SKU' }
  }

  const aliasKey = normaliseInvoiceText(input.description)
  const byAlias = aliasKey ? ctx.aliases.get(aliasKey) : undefined
  if (byAlias) return { inventoryItemId: byAlias, status: 'MATCHED', reason: 'ALIAS' }

  if (!ctx.items.length) return { status: 'NEW', reason: 'NONE' }

  const best = findSimilar(input.description, ctx.items)
  if (!best) return { status: 'NEW', reason: 'NONE' }

  const tied = ctx.items.some((item) => {
    if (item.id === best.target.id) return false
    const score = fuzzyScore(input.description, item.name)
    return score !== null && Math.abs(score - best.score) <= SIMILAR_EPSILON
  })
  if (tied) return { status: 'AMBIGUOUS', reason: 'FUZZY' }

  return { inventoryItemId: best.target.id, status: 'MATCHED', reason: 'FUZZY' }
}

export type LineComparison = {
  status: 'MATCHED' | 'VARIANCE'
  qtyVariance: number
  priceVariance: number
  priceVariancePct: number
}

const VARIANCE_EPSILON = 0.005

export function compareLineToPurchaseOrder(
  line: { qty: number; unitPrice: number },
  poLine: { qty: number; unitPrice: number },
): LineComparison {
  const qtyVariance = (Number(line.qty) || 0) - (Number(poLine.qty) || 0)
  const priceVariance = (Number(line.unitPrice) || 0) - (Number(poLine.unitPrice) || 0)
  const base = Number(poLine.unitPrice) || 0
  const priceVariancePct = base > 0 ? Math.round((priceVariance / base) * 10000) / 100 : 0
  const status =
    Math.abs(qtyVariance) <= VARIANCE_EPSILON && Math.abs(priceVariance) <= VARIANCE_EPSILON
      ? 'MATCHED'
      : 'VARIANCE'
  return { status, qtyVariance, priceVariance, priceVariancePct }
}
