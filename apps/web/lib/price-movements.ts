// Pure supplier price-movement helpers. No Prisma imports.

export type PriceMovementSource = 'RECEIPT' | 'INVOICE' | 'MANUAL'
export type PriceMovementDirection = 'UP' | 'DOWN' | 'SAME'
export type PriceMovementSeverity = 'INFO' | 'WARNING'

export type PriceMovement = {
  changed: boolean
  delta: number
  percent: number | null
  direction: PriceMovementDirection
  severity: PriceMovementSeverity
}

export type PriceMovementDescription = {
  itemName: string
  oldPrice?: number | null
  newPrice: number
  percent: number | null
}

const CHANGE_EPSILON = 0.0001

export function buildPriceMovement(args: {
  oldPrice?: number | null
  newPrice: number
  itemName: string
  source: PriceMovementSource
}): PriceMovement {
  const oldPrice = args.oldPrice
  const newPrice = Number(args.newPrice) || 0
  const hasOld = oldPrice !== null && oldPrice !== undefined && Number.isFinite(Number(oldPrice))
  const base = hasOld ? Number(oldPrice) : newPrice
  const delta = hasOld ? newPrice - base : 0
  const changed = hasOld && Math.abs(delta) > CHANGE_EPSILON

  let direction: PriceMovementDirection = 'SAME'
  if (changed) direction = delta > 0 ? 'UP' : 'DOWN'

  const percent = hasOld && base > 0 ? Math.round((delta / base) * 10000) / 100 : null

  const severity: PriceMovementSeverity = direction === 'UP' ? 'WARNING' : 'INFO'

  return { changed, delta, percent, direction, severity }
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`
}

export function describePriceMovement(movement: PriceMovementDescription): string {
  const oldLabel =
    movement.oldPrice === null || movement.oldPrice === undefined
      ? '—'
      : formatMoney(Number(movement.oldPrice))
  const percentLabel =
    movement.percent === null || movement.percent === undefined
      ? 'NEW'
      : `${movement.percent >= 0 ? '+' : ''}${movement.percent.toFixed(1)}%`
  return `${movement.itemName}: ${oldLabel} -> ${formatMoney(Number(movement.newPrice))} (${percentLabel})`
}

export function shouldAlert(movement: PriceMovement): boolean {
  return movement.changed && movement.severity === 'WARNING'
}
