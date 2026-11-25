import { prisma, TipsShareStatus } from '@hospo-ops/db'
import {
  cashTotalOf,
  tipsProgress,
  totalTips,
  valueTipsShares,
  type CashCounts,
  type TipsShareRow,
  type TipsShareStatusValue,
  type TipsShareValue,
} from './tips'

interface StoredTipsShare {
  id: string
  staffId: string | null
  name: string
  hours: number
  shareWeight: number
  sortOrder: number
  status: TipsShareStatus
  approvalNote: string | null
  issueNote: string | null
  approvedAt: Date | null
  issuedAt: Date | null
  deletedAt: Date | null
}

interface StoredTipsPeriod {
  id: string
  venueId: string
  label: string | null
  fromDate: Date
  toDate: Date
  cashCounts: unknown
  posTotal: number
  notes: string | null
  fullyIssuedAt: Date | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  shares: StoredTipsShare[]
}

export interface TipsPeriodPayload extends Omit<StoredTipsPeriod, 'shares'> {
  poolTotal: number
  shares: TipsShareValue[]
  progress: ReturnType<typeof tipsProgress>
}

function rowFromStored(share: StoredTipsShare): TipsShareRow {
  return {
    id: share.id,
    staffId: share.staffId,
    name: share.name,
    hours: share.hours,
    shareWeight: share.shareWeight,
    sortOrder: share.sortOrder,
    status: share.status as TipsShareStatusValue,
    approvalNote: share.approvalNote,
    issueNote: share.issueNote,
    approvedAt: share.approvedAt,
    issuedAt: share.issuedAt,
  }
}

/** The accrued pool = counted cash + the EFTPOS/POS holding figure. */
export function poolTotalOf(period: { cashCounts: unknown; posTotal: number }): number {
  return totalTips(cashTotalOf(period.cashCounts as CashCounts), period.posTotal)
}

/** Shape one period for an API response, with derived amounts + progress. */
export function buildTipsPeriodPayload(period: StoredTipsPeriod): TipsPeriodPayload {
  const live = period.shares
    .filter((s) => !s.deletedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const poolTotal = poolTotalOf(period)
  const shares = valueTipsShares(poolTotal, live.map(rowFromStored))
  return {
    ...period,
    shares,
    poolTotal,
    progress: tipsProgress(shares),
  }
}

/**
 * Automatic FULLY_ISSUED: once every live row is ISSUED (or already
 * FULLY_ISSUED) and at least one row exists, stamp the whole period. Called
 * after an issue; safe to re-run and safe under a double tap because it only
 * flips rows that are still ISSUED.
 */
export async function maybeFullyIssuePeriod(tipsPeriodId: string): Promise<boolean> {
  const [total, outstanding, issued] = await Promise.all([
    prisma.tipsShare.count({ where: { tipsPeriodId, deletedAt: null } }),
    prisma.tipsShare.count({
      where: {
        tipsPeriodId,
        deletedAt: null,
        status: { notIn: [TipsShareStatus.ISSUED, TipsShareStatus.FULLY_ISSUED] },
      },
    }),
    prisma.tipsShare.count({
      where: { tipsPeriodId, deletedAt: null, status: TipsShareStatus.ISSUED },
    }),
  ])
  if (total === 0 || outstanding > 0 || issued === 0) return false

  const now = new Date()
  await prisma.$transaction([
    prisma.tipsShare.updateMany({
      where: { tipsPeriodId, deletedAt: null, status: TipsShareStatus.ISSUED },
      data: { status: TipsShareStatus.FULLY_ISSUED },
    }),
    prisma.tipsPeriod.updateMany({
      where: { id: tipsPeriodId, fullyIssuedAt: null },
      data: { fullyIssuedAt: now },
    }),
  ])
  return true
}
