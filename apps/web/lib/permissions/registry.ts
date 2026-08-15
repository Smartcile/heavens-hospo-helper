// Granular access-control registry — the single source of truth for the
// permission tree (AREA → SUB-AREA → FUNCTION). Pure and Prisma-free: the DB
// stores leaf keys verbatim (`StaffPermission.permissionKey`), and this file
// drives the grant editor UI, the AdminNav gating and the server guard.
//
// Rules enforced here (see `registryErrors`):
//  - every sub-area's FIRST function is `view` — granting any other function
//    of a sub-area implies its `view` (enforced by `completeGrantSet`)
//  - keys are unique across the whole tree
//  - presets reference only known keys

export interface PermissionFunction {
  key: string
  label: string
}

export interface PermissionSubArea {
  key: string
  label: string
  functions: PermissionFunction[]
}

export interface PermissionArea {
  key: string
  label: string
  subAreas: PermissionSubArea[]
}

export function keyFor(area: string, subArea: string, fn: string): string {
  return `${area}.${subArea}.${fn}`
}

export const PERMISSION_TREE: PermissionArea[] = [
  {
    key: 'dashboard',
    label: 'DASHBOARD',
    subAreas: [{ key: 'overview', label: 'OVERVIEW', functions: [{ key: 'view', label: 'VIEW' }] }],
  },
  {
    key: 'calendar',
    label: 'CALENDAR',
    subAreas: [
      {
        key: 'calendar',
        label: 'CALENDAR',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'edit', label: 'EDIT SHIFTS & TIME OFF' },
        ],
      },
    ],
  },
  {
    key: 'ops',
    label: 'OPS HUB',
    subAreas: [
      {
        key: 'recipes',
        label: 'RECIPES',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE' },
          { key: 'edit', label: 'EDIT' },
          { key: 'delete', label: 'DELETE' },
          { key: 'woolink', label: 'LINK TO WOO' },
        ],
      },
      {
        key: 'menus',
        label: 'MENUS & CATEGORIES',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE' },
          { key: 'edit', label: 'EDIT' },
          { key: 'delete', label: 'DELETE' },
          { key: 'woosync', label: 'WOO CATEGORY SYNC' },
        ],
      },
      {
        key: 'services',
        label: 'SERVICES',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE' },
          { key: 'edit', label: 'EDIT' },
          { key: 'delete', label: 'DELETE' },
        ],
      },
      {
        key: 'inventory',
        label: 'INVENTORY',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE' },
          { key: 'edit', label: 'EDIT' },
          { key: 'delete', label: 'DELETE' },
          { key: 'duplicate', label: 'DUPLICATE' },
          { key: 'restore', label: 'RESTORE DELETED' },
        ],
      },
      {
        key: 'stocktake',
        label: 'STOCKTAKE',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE' },
          { key: 'review', label: 'REVIEW' },
          { key: 'signoff', label: 'SIGN-OFF' },
        ],
      },
    ],
  },
  {
    key: 'bookings',
    label: 'BOOKINGS',
    subAreas: [
      {
        key: 'bookings',
        label: 'BOOKINGS',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE' },
          { key: 'edit', label: 'EDIT' },
          { key: 'status', label: 'CHANGE STATUS' },
          { key: 'delete', label: 'DELETE' },
          { key: 'restore', label: 'RECOVER DELETED' },
        ],
      },
    ],
  },
  {
    key: 'orders',
    label: 'ORDERS',
    subAreas: [
      {
        key: 'orders',
        label: 'ORDERS',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE MANUAL ORDER' },
          { key: 'edit', label: 'EDIT' },
          { key: 'status', label: 'CHANGE STATUS' },
          { key: 'delete', label: 'DELETE' },
          { key: 'preorder', label: 'EDIT PRE-ORDERS' },
        ],
      },
    ],
  },
  {
    key: 'customers',
    label: 'CUSTOMERS',
    subAreas: [
      {
        key: 'customers',
        label: 'CUSTOMERS',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'edit', label: 'EDIT' },
        ],
      },
    ],
  },
  {
    key: 'team',
    label: 'TEAM & PAY',
    subAreas: [
      {
        key: 'staff',
        label: 'STAFF',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE' },
          { key: 'edit', label: 'EDIT' },
          { key: 'delete', label: 'DELETE' },
          { key: 'access', label: 'ACCESS CONTROLS' },
        ],
      },
      {
        key: 'roster',
        label: 'ROSTER',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'edit', label: 'EDIT' },
          { key: 'publish', label: 'PUBLISH / DRAFT' },
          { key: 'print', label: 'PRINT / EXPORT' },
        ],
      },
      {
        key: 'clocks',
        label: 'CLOCKS',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'approve', label: 'APPROVE / REJECT' },
          { key: 'manual', label: 'ADD / EDIT CLOCKS' },
        ],
      },
      {
        key: 'payroll',
        label: 'PAYROLL',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'close', label: 'CLOSE PERIOD' },
          { key: 'markpaid', label: 'MARK PAID' },
          { key: 'export', label: 'EXPORT' },
        ],
      },
    ],
  },
  {
    key: 'execution',
    label: 'DAILY TASKS',
    subAreas: [
      {
        key: 'tasks',
        label: 'TASKS & CHECKLISTS',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE' },
          { key: 'edit', label: 'EDIT' },
          { key: 'delete', label: 'DELETE' },
          { key: 'archive', label: 'ARCHIVE' },
        ],
      },
      {
        key: 'review',
        label: 'REVIEW',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'signoff', label: 'SIGN-OFF' },
        ],
      },
      {
        key: 'followups',
        label: 'FOLLOW-UPS',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'resolve', label: 'RESOLVE / SIGN-OFF' },
        ],
      },
    ],
  },
  {
    key: 'training',
    label: 'TRAINING',
    subAreas: [
      {
        key: 'playbook',
        label: 'PLAYBOOK',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE' },
          { key: 'edit', label: 'EDIT' },
          { key: 'publish', label: 'PUBLISH' },
          { key: 'assign', label: 'ASSIGN / SIGN-OFF' },
        ],
      },
      {
        key: 'pathways',
        label: 'PATHWAYS',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE' },
          { key: 'edit', label: 'EDIT' },
        ],
      },
    ],
  },
  {
    key: 'compliance',
    label: 'COMPLIANCE',
    subAreas: [
      {
        key: 'tasks',
        label: 'H&S TASKS',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE' },
          { key: 'edit', label: 'EDIT' },
          { key: 'archive', label: 'ARCHIVE' },
        ],
      },
      {
        key: 'deliveries',
        label: 'DELIVERIES',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'create', label: 'CREATE' },
          { key: 'edit', label: 'EDIT' },
          { key: 'delete', label: 'DELETE' },
        ],
      },
      {
        key: 'alerts',
        label: 'ALERTS',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'raise', label: 'RAISE MANUAL' },
          { key: 'resolve', label: 'RESOLVE' },
        ],
      },
    ],
  },
  {
    key: 'performance',
    label: 'PERFORMANCE',
    subAreas: [
      {
        key: 'budget',
        label: 'BUDGET',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'edit', label: 'EDIT' },
        ],
      },
      {
        key: 'reports',
        label: 'REPORTS',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'export', label: 'EXPORT' },
        ],
      },
      {
        key: 'giftcards',
        label: 'GIFT CARDS',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'issue', label: 'ISSUE' },
          { key: 'redeem', label: 'REDEEM / VOID' },
        ],
      },
    ],
  },
  {
    key: 'floorplans',
    label: 'FLOOR PLANS',
    subAreas: [
      {
        key: 'plans',
        label: 'PLANS',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'edit', label: 'EDIT' },
        ],
      },
    ],
  },
  {
    key: 'notices',
    label: 'NOTICES',
    subAreas: [
      {
        key: 'notices',
        label: 'NOTICES',
        functions: [
          { key: 'view', label: 'VIEW' },
          { key: 'post', label: 'POST' },
          { key: 'delete', label: 'DELETE' },
        ],
      },
    ],
  },
]

export interface PermissionPreset {
  key: string
  label: string
  keys: string[]
}

export const PERMISSION_PRESETS: PermissionPreset[] = [
  { key: 'owner', label: 'OWNER — FULL ACCESS', keys: allPermissionKeys() },
  {
    key: 'bar',
    label: 'BAR MANAGER',
    keys: [
      keyFor('ops', 'recipes', 'view'),
      keyFor('ops', 'menus', 'view'),
      keyFor('ops', 'services', 'view'),
      keyFor('ops', 'services', 'edit'),
      keyFor('ops', 'inventory', 'view'),
      keyFor('ops', 'inventory', 'create'),
      keyFor('ops', 'inventory', 'edit'),
      keyFor('ops', 'stocktake', 'view'),
      keyFor('ops', 'stocktake', 'create'),
      keyFor('bookings', 'bookings', 'view'),
      keyFor('bookings', 'bookings', 'create'),
      keyFor('bookings', 'bookings', 'edit'),
      keyFor('bookings', 'bookings', 'status'),
      keyFor('orders', 'orders', 'view'),
      keyFor('customers', 'customers', 'view'),
      keyFor('team', 'roster', 'view'),
      keyFor('team', 'clocks', 'view'),
      keyFor('team', 'clocks', 'approve'),
      keyFor('compliance', 'tasks', 'view'),
      keyFor('compliance', 'alerts', 'view'),
      keyFor('floorplans', 'plans', 'view'),
      keyFor('notices', 'notices', 'view'),
      keyFor('notices', 'notices', 'post'),
    ],
  },
  {
    key: 'kitchen',
    label: 'KITCHEN MANAGER',
    keys: [
      keyFor('ops', 'recipes', 'view'),
      keyFor('ops', 'recipes', 'create'),
      keyFor('ops', 'recipes', 'edit'),
      keyFor('ops', 'inventory', 'view'),
      keyFor('ops', 'inventory', 'create'),
      keyFor('ops', 'inventory', 'edit'),
      keyFor('ops', 'stocktake', 'view'),
      keyFor('ops', 'stocktake', 'create'),
      keyFor('ops', 'stocktake', 'review'),
      keyFor('ops', 'stocktake', 'signoff'),
      keyFor('orders', 'orders', 'view'),
      keyFor('orders', 'orders', 'status'),
      keyFor('team', 'clocks', 'view'),
      keyFor('compliance', 'tasks', 'view'),
      keyFor('compliance', 'tasks', 'create'),
      keyFor('compliance', 'tasks', 'edit'),
      keyFor('compliance', 'deliveries', 'view'),
      keyFor('compliance', 'deliveries', 'create'),
      keyFor('compliance', 'alerts', 'view'),
      keyFor('compliance', 'alerts', 'resolve'),
      keyFor('floorplans', 'plans', 'view'),
      keyFor('notices', 'notices', 'view'),
    ],
  },
  {
    key: 'foh',
    label: 'FOH MANAGER',
    keys: [
      keyFor('bookings', 'bookings', 'view'),
      keyFor('bookings', 'bookings', 'create'),
      keyFor('bookings', 'bookings', 'edit'),
      keyFor('bookings', 'bookings', 'status'),
      keyFor('orders', 'orders', 'view'),
      keyFor('orders', 'orders', 'create'),
      keyFor('orders', 'orders', 'edit'),
      keyFor('orders', 'orders', 'status'),
      keyFor('customers', 'customers', 'view'),
      keyFor('customers', 'customers', 'edit'),
      keyFor('team', 'clocks', 'view'),
      keyFor('floorplans', 'plans', 'view'),
      keyFor('notices', 'notices', 'view'),
      keyFor('notices', 'notices', 'post'),
    ],
  },
  {
    key: 'hs',
    label: 'H&S OFFICER',
    keys: [
      keyFor('compliance', 'tasks', 'view'),
      keyFor('compliance', 'tasks', 'create'),
      keyFor('compliance', 'tasks', 'edit'),
      keyFor('compliance', 'deliveries', 'view'),
      keyFor('compliance', 'deliveries', 'create'),
      keyFor('compliance', 'deliveries', 'edit'),
      keyFor('compliance', 'alerts', 'view'),
      keyFor('compliance', 'alerts', 'raise'),
      keyFor('compliance', 'alerts', 'resolve'),
      keyFor('ops', 'inventory', 'view'),
      keyFor('notices', 'notices', 'view'),
    ],
  },
]

/** Every leaf key in the tree, in order. */
export function allPermissionKeys(): string[] {
  const keys: string[] = []
  for (const area of PERMISSION_TREE) {
    for (const sub of area.subAreas) {
      for (const fn of sub.functions) {
        keys.push(keyFor(area.key, sub.key, fn.key))
      }
    }
  }
  return keys
}

/** True when the key is a sub-area's `view` function. */
export function isViewKey(key: string): boolean {
  return key.endsWith('.view')
}

/** The AREA key a permission key belongs to (e.g. `bookings.create` → `bookings`). */
export function areaKeyOfPermissionKey(key: string): string | null {
  const area = PERMISSION_TREE.find((a) => key.startsWith(`${a.key}.`))
  return area ? area.key : null
}

/** All keys of a given area (used for nav gating). */
export function keysForArea(areaKey: string): string[] {
  return allPermissionKeys().filter((k) => k.startsWith(`${areaKey}.`))
}

/**
 * Adds the implied `view` keys: any granted function of a sub-area brings its
 * sub-area's `view` along. Granting nothing is allowed (empty set = nothing).
 * Unknown keys are dropped.
 */
export function completeGrantSet(keys: string[]): string[] {
  const known = new Set(allPermissionKeys())
  const result = new Set<string>()
  for (const key of keys) {
    if (!known.has(key)) continue
    result.add(key)
    if (!isViewKey(key)) {
      const viewKey = `${key.slice(0, key.lastIndexOf('.'))}.view`
      if (known.has(viewKey)) result.add(viewKey)
    }
  }
  return [...result]
}

/** Returns human-readable problems with the registry (empty = healthy). */
export function registryErrors(): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  const known = new Set(allPermissionKeys())
  for (const area of PERMISSION_TREE) {
    for (const sub of area.subAreas) {
      if (sub.functions[0]?.key !== 'view') {
        errors.push(`${area.key}.${sub.key}: first function must be 'view'`)
      }
      for (const fn of sub.functions) {
        const key = keyFor(area.key, sub.key, fn.key)
        if (seen.has(key)) errors.push(`duplicate key: ${key}`)
        seen.add(key)
      }
    }
  }
  for (const preset of PERMISSION_PRESETS) {
    if (preset.keys.length === 0) errors.push(`preset ${preset.key}: empty`)
    for (const key of preset.keys) {
      if (!known.has(key)) errors.push(`preset ${preset.key}: unknown key ${key}`)
    }
  }
  return errors
}
