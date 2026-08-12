import { describe, it, expect } from 'vitest'
import {
  OPS_TABS, TEAM_TABS, EXECUTION_TABS, TRAINING_TABS, SETTINGS_TABS,
  resolveTab, forwardSearch, hubUrl,
} from './hub-tabs'

describe('hub-tabs', () => {
  it('OPS HUB has 5 tabs in Sell → Seat → Serve → Stock order', () => {
    expect(OPS_TABS.map((t) => t.id)).toEqual(['menu', 'bookings', 'orders', 'customers', 'inventory'])
    expect(OPS_TABS[0].label).toBe('MENU & SERVICES')
    expect(OPS_TABS[0].subTabs?.map((s) => s.id)).toEqual(['recipes', 'menus', 'services'])
    expect(OPS_TABS[4].label).toBe('INVENTORY & STOCKTAKE')
    expect(OPS_TABS[4].subTabs?.map((s) => s.id)).toEqual(['inventory', 'stocktake'])
    expect(OPS_TABS[4].defaultSub).toBe('inventory')
  })

  it('the three team hubs have their tab sets', () => {
    expect(TEAM_TABS.map((t) => t.id)).toEqual(['staff', 'roster', 'clocks', 'payroll'])
    expect(EXECUTION_TABS.map((t) => t.id)).toEqual(['tasks', 'review', 'followups'])
    expect(TRAINING_TABS.map((t) => t.id)).toEqual(['playbook', 'pathways'])
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual(['general', 'structure', 'uoms', 'suppliers', 'qrcodes', 'sync'])
  })

  it('resolveTab falls back to the first tab and default sub-tabs', () => {
    expect(resolveTab(OPS_TABS, 'orders', 'x')).toEqual({ tab: 'orders' })
    expect(resolveTab(OPS_TABS, 'bogus', null)).toEqual({ tab: 'menu', sub: 'recipes' })
    expect(resolveTab(OPS_TABS, null, null)).toEqual({ tab: 'menu', sub: 'recipes' })
    expect(resolveTab(OPS_TABS, 'menu', 'services')).toEqual({ tab: 'menu', sub: 'services' })
    expect(resolveTab(OPS_TABS, 'inventory', 'stocktake')).toEqual({ tab: 'inventory', sub: 'stocktake' })
    expect(resolveTab(OPS_TABS, 'inventory', 'bogus')).toEqual({ tab: 'inventory', sub: 'inventory' })
    expect(resolveTab(TEAM_TABS, 'payroll', null)).toEqual({ tab: 'payroll' })
    expect(resolveTab(SETTINGS_TABS, null, null)).toEqual({ tab: 'general' })
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
