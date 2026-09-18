export interface TabDef {
  id: string
  label: string
  /** Optional tooltip for the tab's button (rendered as a `title` attr). */
  title?: string
  subTabs?: { id: string; label: string }[]
  defaultSub?: string
}

// ── OPS HUB ─────────────────────────────────────────────────────────────
// The five ops areas live in the SIDEBAR (see NAV_GROUPS in AdminNav). The
// /admin/ops top bar shows ONLY the active area's fine tabs (OPS_SUB_TABS) —
// a single row, the same shape as every other hub page's top bar.
// CUSTOMERS is a leaf: it has no fine tabs and renders without a top bar.
export const OPS_AREAS: TabDef[] = [
  { id: 'menu', label: 'MENU & SERVICES' },
  { id: 'bookings', label: 'BOOKINGS' },
  { id: 'orders', label: 'ORDERS' },
  { id: 'customers', label: 'CUSTOMERS' },
  { id: 'inventory', label: 'INVENTORY & STOCKTAKE' },
]

export const OPS_SUB_TABS: Record<string, TabDef[]> = {
  menu: [
    { id: 'recipes', label: 'RECIPES' },
    { id: 'menus', label: 'MENUS & CATEGORIES' },
    { id: 'services', label: 'SERVICES' },
  ],
  bookings: [
    { id: 'diary', label: 'DIARY' },
    { id: 'table', label: 'TABLE' },
    { id: 'deleted', label: 'DELETED' },
  ],
  orders: [
    { id: 'all', label: 'ALL', title: 'EVERY SYNCED ORDER — DEBUG' },
    { id: 'service', label: 'SERVICE', title: 'BY TIME SLOT' },
    { id: 'kitchen', label: 'KITCHEN', title: 'PREP TOTALS + ALLERGENS' },
    { id: 'foh', label: 'FOH', title: 'BY TABLE' },
    { id: 'production', label: 'PRODUCTION', title: 'PICK LIST' },
  ],
  inventory: [
    { id: 'inventory', label: 'INVENTORY' },
    { id: 'stocktake', label: 'STOCKTAKE' },
  ],
}

const OPS_SUB_DEFAULTS: Record<string, string> = {
  menu: 'recipes',
  bookings: 'table',
  orders: 'service',
  inventory: 'inventory',
}

/** Resolve the active ops area + fine sub-tab from the URL params. */
export function resolveOps(
  tabParam: string | null | undefined,
  subParam: string | null | undefined,
): { area: string; sub?: string } {
  const area = OPS_AREAS.some((a) => a.id === tabParam)
    ? (tabParam as string)
    : OPS_AREAS[0].id
  const subs = OPS_SUB_TABS[area]
  if (!subs) return { area }
  const wanted =
    subParam && subs.some((s) => s.id === subParam) ? subParam : OPS_SUB_DEFAULTS[area]
  return { area, sub: wanted }
}

export const TEAM_TABS: TabDef[] = [
  { id: 'staff', label: 'STAFF' },
  { id: 'roster', label: 'ROSTER' },
  { id: 'clocks', label: 'CLOCKS' },
  { id: 'payroll', label: 'PAYROLL' },
]

export const EXECUTION_TABS: TabDef[] = [
  { id: 'tasks', label: 'TASKS' },
  { id: 'review', label: 'REVIEW' },
  { id: 'followups', label: 'FOLLOW-UPS' },
]

export const TRAINING_TABS: TabDef[] = [
  { id: 'playbook', label: 'PLAYBOOK' },
  { id: 'pathways', label: 'PATHWAYS' },
]

export const SETTINGS_TABS: TabDef[] = [
  { id: 'general', label: 'GENERAL' },
  { id: 'structure', label: 'STRUCTURE' },
  { id: 'floorplans', label: 'FLOOR PLANS' }, // grant-gated — see SettingsClient
  { id: 'uoms', label: 'UNITS OF MEASURE' },
  { id: 'suppliers', label: 'SUPPLIERS' },
  { id: 'qrcodes', label: 'QR CODES' },
  { id: 'sync', label: 'SYNC' },
  { id: 'files', label: 'FILES' }, // admin-only — see SettingsClient
]

// Food Health & Safety (NZ GFMP) — Chomp-style hub. LOGGERS arrives with the
// sensor phase (Phase 3 of the ROADMAP); the tab exists so the bar is stable.
export const COMPLIANCE_TABS: TabDef[] = [
  { id: 'tasks', label: 'TASKS' },
  { id: 'deliveries', label: 'DELIVERIES' },
  { id: 'alerts', label: 'ALERTS' },
  { id: 'loggers', label: 'LOGGERS' },
]

// BEO / events hub. EVENTS is the planner (list + block builder); TEMPLATES is
// the reusable-package library; REQUESTS is the customer-submitted queue.
export const EVENTS_TABS: TabDef[] = [
  { id: 'events', label: 'EVENTS' },
  { id: 'templates', label: 'TEMPLATES' },
  { id: 'requests', label: 'REQUESTS' },
]

/** The active tab + sub-tab for a URL's ?tab=/&sub= params, with fallbacks. */
export function resolveTab(
  tabs: TabDef[],
  tabParam: string | null | undefined,
  subParam: string | null | undefined,
): { tab: string; sub?: string } {
  const def = tabs.find((t) => t.id === tabParam) ?? tabs[0]
  if (!def?.subTabs?.length) return { tab: def.id }
  const wanted =
    subParam && def.subTabs.some((s) => s.id === subParam) ? subParam : def.defaultSub
  return { tab: def.id, sub: wanted ?? def.subTabs[0].id }
}

/** Serialise a Next.js page `searchParams` object into a query string
 *  (first value wins for arrays, tab/sub are dropped — they are rebuilt). */
export function forwardSearch(searchParams: Record<string, string | string[] | undefined> = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'tab' || key === 'sub') continue
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value[0])
    } else if (value != null) {
      params.set(key, value)
    }
  }
  return params.toString()
}

export function hubUrl(base: string, tab: string, sub?: string | null, search?: string): string {
  const params = new URLSearchParams()
  params.set('tab', tab)
  if (sub) params.set('sub', sub)
  if (search) {
    const extra = new URLSearchParams(search)
    for (const [key, value] of extra) {
      if (key === 'tab' || key === 'sub') continue
      params.append(key, value)
    }
  }
  return `${base}?${params.toString()}`
}
