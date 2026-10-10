// Dashboard widget registry + layout maths. Pure and Prisma-free: the admin
// dashboard imports this in the browser; the layout is saved as
// `Staff.dashboardLayout` = { order, hidden }.

export interface WidgetDef {
  id: string
  label: string
  span: 'full' | 'half'
}

export const DASHBOARD_WIDGETS: WidgetDef[] = [
  { id: 'SUMMARY', label: 'TASKS SUMMARY', span: 'full' },
  { id: 'ATTENTION', label: 'ATTENTION NEEDED', span: 'half' },
  { id: 'PROGRESS', label: 'OVERALL PROGRESS', span: 'half' },
  { id: 'BOOKINGS', label: "TODAY'S BOOKINGS", span: 'half' },
  { id: 'ORDERS', label: "TODAY'S ORDERS", span: 'half' },
  { id: 'EVENTS', label: 'UPCOMING EVENTS', span: 'half' },
  { id: 'TRAINING', label: 'TRAINING STATUS', span: 'half' },
  { id: 'STOCK', label: 'PAR / STOCK ALERTS', span: 'half' },
  { id: 'FOOD_SAFETY', label: 'FOOD SAFETY ALERTS', span: 'half' },
  { id: 'LIVE_FLOOR', label: 'LIVE FLOOR', span: 'half' },
  { id: 'MISSED', label: 'MISSED TASKS — 7 DAYS', span: 'half' },
  { id: 'RECENT', label: 'RECENT ACTIVITY', span: 'half' },
  { id: 'BY_DEPARTMENT', label: 'BY DEPARTMENT', span: 'full' },
]

export const DEFAULT_WIDGET_ORDER: string[] = DASHBOARD_WIDGETS.map((w) => w.id)

export interface DashboardLayout {
  order: string[]
  hidden: string[]
}

const VALID = new Set(DEFAULT_WIDGET_ORDER)

/**
 * Normalise a stored layout: unknown ids dropped, missing ids appended in the
 * default order, so a widget added in a later release still shows up.
 */
export function parseDashboardLayout(raw: unknown): DashboardLayout {
  const stored = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as { order?: unknown; hidden?: unknown })
    : {}
  const order: string[] = []
  if (Array.isArray(stored.order)) {
    for (const id of stored.order) {
      if (typeof id === 'string' && VALID.has(id) && !order.includes(id)) order.push(id)
    }
  }
  for (const id of DEFAULT_WIDGET_ORDER) {
    if (!order.includes(id)) order.push(id)
  }
  const hidden: string[] = []
  if (Array.isArray(stored.hidden)) {
    for (const id of stored.hidden) {
      if (typeof id === 'string' && VALID.has(id) && !hidden.includes(id)) hidden.push(id)
    }
  }
  return { order, hidden }
}

/** Move a widget to a new index (clamped). Returns a new array. */
export function moveWidget(order: string[], id: string, toIndex: number): string[] {
  const from = order.indexOf(id)
  if (from === -1) return order
  const next = [...order]
  next.splice(from, 1)
  const clamped = Math.max(0, Math.min(toIndex, next.length))
  next.splice(clamped, 0, id)
  return next
}

/** The visible widgets, in layout order. */
export function visibleWidgets(layout: DashboardLayout): WidgetDef[] {
  const hidden = new Set(layout.hidden)
  const byId = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w]))
  return layout.order
    .filter((id) => !hidden.has(id))
    .map((id) => byId.get(id))
    .filter((w): w is WidgetDef => !!w)
}
