import { describe, expect, it } from 'vitest'
import {
  PERMISSION_PRESETS,
  allPermissionKeys,
  areaKeyOfPermissionKey,
  completeGrantSet,
  isViewKey,
  keyFor,
  keysForArea,
  registryErrors,
} from './registry'
import { resolveAccess } from '@/lib/permissions'

describe('permissions registry', () => {
  it('is healthy — no duplicate keys, every sub-area starts with view, presets valid', () => {
    expect(registryErrors()).toEqual([])
  })

  it('builds dotted keys', () => {
    expect(keyFor('bookings', 'bookings', 'create')).toBe('bookings.bookings.create')
  })

  it('allPermissionKeys returns unique keys in order', () => {
    const keys = allPermissionKeys()
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('bookings.bookings.view')
    expect(keys).toContain('team.payroll.close')
  })

  it('isViewKey only matches view functions', () => {
    expect(isViewKey('bookings.bookings.view')).toBe(true)
    expect(isViewKey('bookings.bookings.create')).toBe(false)
  })

  it('areaKeyOfPermissionKey resolves the owning area', () => {
    expect(areaKeyOfPermissionKey('ops.inventory.edit')).toBe('ops')
    expect(areaKeyOfPermissionKey('compliance.alerts.resolve')).toBe('compliance')
    expect(areaKeyOfPermissionKey('nonsense.key')).toBeNull()
  })

  it('keysForArea returns only that area\'s keys', () => {
    const keys = keysForArea('floorplans')
    expect(keys).toContain('floorplans.plans.view')
    expect(keys).toContain('floorplans.plans.edit')
    expect(keys.every((k) => k.startsWith('floorplans.'))).toBe(true)
  })

  it('completeGrantSet keeps granted keys and adds implied views', () => {
    const set = completeGrantSet(['ops.inventory.edit', 'team.payroll.close'])
    expect(set).toContain('ops.inventory.edit')
    expect(set).toContain('ops.inventory.view')
    expect(set).toContain('team.payroll.close')
    expect(set).toContain('team.payroll.view')
  })

  it('completeGrantSet drops unknown keys and stays a clean set', () => {
    const set = completeGrantSet(['ops.inventory.view', 'not.a.real.key', 'bookings.bookings.view'])
    expect(set).toEqual(['ops.inventory.view', 'bookings.bookings.view'])
  })

  it('completeGrantSet of empty input is empty', () => {
    expect(completeGrantSet([])).toEqual([])
  })

  it('every preset key is known and every preset is non-empty', () => {
    const known = new Set(allPermissionKeys())
    for (const preset of PERMISSION_PRESETS) {
      expect(preset.keys.length).toBeGreaterThan(0)
      for (const key of preset.keys) expect(known.has(key)).toBe(true)
    }
  })

  it('presets complete to themselves (presets already carry implied views)', () => {
    for (const preset of PERMISSION_PRESETS) {
      expect(completeGrantSet(preset.keys).sort()).toEqual(preset.keys.sort())
    }
  })
})

describe('resolveAccess', () => {
  const full = { role: 'MANAGER', restricted: false, grants: [] }

  it('ADMIN always passes, even restricted with no grants', () => {
    expect(resolveAccess({ role: 'ADMIN', restricted: true, grants: [] }, 'anything')).toBe(true)
  })

  it('STAFF never passes', () => {
    expect(resolveAccess({ role: 'STAFF', restricted: false, grants: ['x'] }, 'x')).toBe(false)
  })

  it('unrestricted MANAGER keeps full legacy access', () => {
    expect(resolveAccess(full, 'team.payroll.close')).toBe(true)
  })

  it('restricted MANAGER passes only granted keys', () => {
    const restricted = { role: 'MANAGER', restricted: true, grants: ['bookings.bookings.view'] }
    expect(resolveAccess(restricted, 'bookings.bookings.view')).toBe(true)
    expect(resolveAccess(restricted, 'bookings.bookings.delete')).toBe(false)
    expect(resolveAccess(restricted, 'team.payroll.close')).toBe(false)
  })

  it('restricted MANAGER with no grants passes nothing', () => {
    expect(resolveAccess({ role: 'MANAGER', restricted: true, grants: [] }, 'ops.inventory.view')).toBe(false)
  })
})
