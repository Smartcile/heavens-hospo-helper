import { describe, it, expect } from 'vitest'
import {
  OPS_AREAS, OPS_SUB_TABS, resolveOps,
  TEAM_TABS, EXECUTION_TABS, TRAINING_TABS, SETTINGS_TABS, COMPLIANCE_TABS,
  resolveTab, forwardSearch, hubUrl,
} from './hub-tabs'

describe('hub-tabs', () => {
  it('OPS HUB areas are the 5 sidebar destinations in Sell → Seat → Serve → Stock order', () => {
    expect(OPS_AREAS.map((t) => t.id)).toEqual(['menu', 'bookings', 'orders', 'customers', 'inventory'])
    expect(OPS_AREAS.map((t) => t.label)).toEqual([
      'MENU & SERVICES', 'BOOKINGS', 'ORDERS', 'CUSTOMERS', 'INVENTORY & STOCKTAKE',
    ])
  })

  it('each ops area has its own fine-tab set for the top bar (customers is a leaf)', () => {
    expect(OPS_SUB_TABS.menu.map((s) => s.id)).toEqual(['recipes', 'menus', 'services'])
    expect(OPS_SUB_TABS.bookings.map((s) => s.id)).toEqual(['diary', 'table', 'deleted'])
    expect(OPS_SUB_TABS.orders.map((s) => s.id)).toEqual(['all', 'service', 'kitchen', 'foh', 'production'])
    expect(OPS_SUB_TABS.orders.find((s) => s.id === 'all')?.title).toContain('EVERY SYNCED ORDER')
    expect(OPS_SUB_TABS.inventory.map((s) => s.id)).toEqual(['inventory', 'stocktake'])
    expect(OPS_SUB_TABS.customers).toBeUndefined()
  })

  it('the three team hubs have their tab sets', () => {
    expect(TEAM_TABS.map((t) => t.id)).toEqual(['staff', 'roster', 'clocks', 'payroll'])
    expect(EXECUTION_TABS.map((t) => t.id)).toEqual(['tasks', 'review', 'followups'])
    expect(TRAINING_TABS.map((t) => t.id)).toEqual(['playbook', 'pathways'])
    // FLOOR PLANS is grant-gated and FILES is admin-only — SettingsClient hides both.
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual(['general', 'structure', 'floorplans', 'uoms', 'suppliers', 'qrcodes', 'sync', 'files'])
  })

  it('COMPLIANCE has the Chomp-style tab set', () => {
    expect(COMPLIANCE_TABS.map((t) => t.id)).toEqual(['tasks', 'deliveries', 'alerts', 'loggers'])
    expect(COMPLIANCE_TABS.map((t) => t.label)).toEqual(['TASKS', 'DELIVERIES', 'ALERTS', 'LOGGERS'])
    expect(resolveTab(COMPLIANCE_TABS, null, null)).toEqual({ tab: 'tasks' })
    expect(resolveTab(COMPLIANCE_TABS, 'alerts', null)).toEqual({ tab: 'alerts' })
    expect(resolveTab(COMPLIANCE_TABS, 'bogus', null)).toEqual({ tab: 'tasks' })
    expect(hubUrl('/admin/compliance', 'deliveries')).toBe('/admin/compliance?tab=deliveries')
  })

  it('resolveTab falls back to the first tab and default sub-tabs', () => {
    expect(resolveTab(TEAM_TABS, 'payroll', null)).toEqual({ tab: 'payroll' })
    expect(resolveTab(SETTINGS_TABS, null, null)).toEqual({ tab: 'general' })
  })

  it('resolveOps resolves the area and defaults the fine sub-tab', () => {
    expect(resolveOps(null, null)).toEqual({ area: 'menu', sub: 'recipes' })
    expect(resolveOps('bogus', null)).toEqual({ area: 'menu', sub: 'recipes' })
    expect(resolveOps('orders', 'x')).toEqual({ area: 'orders', sub: 'service' })
    expect(resolveOps('menu', 'services')).toEqual({ area: 'menu', sub: 'services' })
    expect(resolveOps('inventory', 'stocktake')).toEqual({ area: 'inventory', sub: 'stocktake' })
    expect(resolveOps('inventory', 'bogus')).toEqual({ area: 'inventory', sub: 'inventory' })
    expect(resolveOps('bookings', null)).toEqual({ area: 'bookings', sub: 'table' })
    expect(resolveOps('bookings', 'diary')).toEqual({ area: 'bookings', sub: 'diary' })
    // Leaf areas have no sub.
    expect(resolveOps('customers', null)).toEqual({ area: 'customers' })
  })

  it('forwardSearch keeps other params and drops tab/sub', () => {
    expect(forwardSearch({ date: '2026-08-14', tab: 'orders', sub: 'x' })).toBe('date=2026-08-14')
    expect(forwardSearch({ a: ['1', '2'], b: undefined, c: '3' })).toBe('a=1&c=3')
    expect(forwardSearch({})).toBe('')
  })

  it('hubUrl builds hub URLs with tab, sub and forwarded params', () => {
    expect(hubUrl('/admin/ops', 'orders')).toBe('/admin/ops?tab=orders')
    expect(hubUrl('/admin/team', 'payroll')).toBe('/admin/team?tab=payroll')
    expect(hubUrl('/admin/ops', 'menu', 'services')).toBe('/admin/ops?tab=menu&sub=services')
    expect(hubUrl('/admin/ops', 'inventory', 'stocktake')).toBe('/admin/ops?tab=inventory&sub=stocktake')
    expect(hubUrl('/admin/settings', 'structure', null, 'guide=abc')).toBe('/admin/settings?tab=structure&guide=abc')
    expect(hubUrl('/admin/execution', 'tasks', null, 'tab=x&guide=abc')).toBe('/admin/execution?tab=tasks&guide=abc')
  })
})
