export interface TabDef {
  id: string
  label: string
  subTabs?: { id: string; label: string }[]
  defaultSub?: string
}

export const OPS_TABS: TabDef[] = [
  {
    id: 'menu',
    label: 'MENU & SERVICES',
    subTabs: [
      { id: 'recipes', label: 'RECIPES' },
      { id: 'menus', label: 'MENUS & CATEGORIES' },
      { id: 'services', label: 'SERVICES' },
    ],
    defaultSub: 'recipes',
  },
  { id: 'bookings', label: 'BOOKINGS' },
  { id: 'orders', label: 'ORDERS' },
  { id: 'customers', label: 'CUSTOMERS' },
  {
    id: 'inventory',
    label: 'INVENTORY & STOCKTAKE',
    subTabs: [
      { id: 'inventory', label: 'INVENTORY' },
      { id: 'stocktake', label: 'STOCKTAKE' },
    ],
    defaultSub: 'inventory',
  },
]

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
  { id: 'uoms', label: 'UNITS OF MEASURE' },
  { id: 'suppliers', label: 'SUPPLIERS' },
  { id: 'qrcodes', label: 'QR CODES' },
  { id: 'sync', label: 'SYNC' },
]

// Food Health & Safety (NZ GFMP) — Chomp-style hub. LOGGERS arrives with the
// sensor phase (Phase 3 of the ROADMAP); the tab exists so the bar is stable.
export const COMPLIANCE_TABS: TabDef[] = [
  { id: 'tasks', label: 'TASKS' },
  { id: 'deliveries', label: 'DELIVERIES' },
  { id: 'alerts', label: 'ALERTS' },
  { id: 'loggers', label: 'LOGGERS' },
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
