// Pure purchase-order maths and status helpers. No Prisma imports.

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED'

export type PoLineInput = {
  qty: number
  unitPrice: number
  receivedQty?: number
}

export type PurchaseOrderTotals = {
  subtotal: number
  gst: number
  total: number
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function computePurchaseOrderTotals(
  lines: PoLineInput[],
  gstRate = 0.15,
): PurchaseOrderTotals {
  const subtotal = round2(
    lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitPrice) || 0), 0),
  )
  const rate = Number.isFinite(gstRate) ? gstRate : 0
  const gst = round2(subtotal * rate)
  return { subtotal, gst, total: round2(subtotal + gst) }
}

export function purchaseOrderStatusFromLines(
  lines: PoLineInput[],
  currentStatus: PurchaseOrderStatus = 'DRAFT',
): PurchaseOrderStatus {
  if (currentStatus === 'CANCELLED') return 'CANCELLED'
  if (lines.length === 0) return currentStatus === 'DRAFT' ? 'DRAFT' : currentStatus

  const totalQty = lines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0)
  const receivedQty = lines.reduce(
    (sum, line) => sum + Math.max(0, Number(line.receivedQty) || 0),
    0,
  )

  if (receivedQty <= 0) return currentStatus === 'DRAFT' ? 'DRAFT' : 'SENT'
  if (receivedQty >= totalQty) return 'RECEIVED'
  return 'PARTIALLY_RECEIVED'
}

export type ReceiptResult = {
  receivedQty: number
  remaining: number
  overReceived: boolean
}

export function applyReceipt(line: PoLineInput, qty: number): ReceiptResult {
  const ordered = Math.max(0, Number(line.qty) || 0)
  const already = Math.max(0, Number(line.receivedQty) || 0)
  const incoming = Math.max(0, Number(qty) || 0)
  const next = already + incoming
  const receivedQty = Math.min(ordered, next)
  return {
    receivedQty,
    remaining: round2(Math.max(0, ordered - receivedQty)),
    overReceived: next > ordered,
  }
}

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'DRAFT — NOT SENT',
  SENT: 'SENT TO SUPPLIER',
  PARTIALLY_RECEIVED: 'PARTIALLY RECEIVED',
  RECEIVED: 'FULLY RECEIVED',
  CANCELLED: 'CANCELLED',
}

export function describePurchaseOrderStatus(status: PurchaseOrderStatus): string {
  return STATUS_LABELS[status] ?? String(status)
}
