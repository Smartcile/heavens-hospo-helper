import { describe, it, expect } from 'vitest'
import { shouldBlockDemoWrite, type DemoBlockToken } from '@/lib/demo-block'

describe('shouldBlockDemoWrite', () => {
  const demoManager: DemoBlockToken = { venueIsDemo: true, role: 'MANAGER' }
  const demoAdmin: DemoBlockToken = { venueIsDemo: true, role: 'ADMIN' }
  const normalManager: DemoBlockToken = { venueIsDemo: false, role: 'MANAGER' }
  const normalAdmin: DemoBlockToken = { venueIsDemo: false, role: 'ADMIN' }

  it('blocks POST on /api/admin for demo manager', () => {
    expect(shouldBlockDemoWrite('/api/admin/tasks', 'POST', demoManager)).toBe(true)
  })

  it('blocks PUT on /api/admin for demo manager', () => {
    expect(shouldBlockDemoWrite('/api/admin/staff/abc', 'PUT', demoManager)).toBe(true)
  })

  it('blocks PATCH on /api/admin for demo manager', () => {
    expect(shouldBlockDemoWrite('/api/admin/venues/abc', 'PATCH', demoManager)).toBe(true)
  })

  it('blocks DELETE on /api/admin for demo manager', () => {
    expect(shouldBlockDemoWrite('/api/admin/checklists/abc', 'DELETE', demoManager)).toBe(true)
  })

  it('allows GET on /api/admin for demo manager', () => {
    expect(shouldBlockDemoWrite('/api/admin/tasks', 'GET', demoManager)).toBe(false)
  })

  it('allows POST for demo admin', () => {
    expect(shouldBlockDemoWrite('/api/admin/tasks', 'POST', demoAdmin)).toBe(false)
  })

  it('allows PUT for demo admin', () => {
    expect(shouldBlockDemoWrite('/api/admin/staff/abc', 'PUT', demoAdmin)).toBe(false)
  })

  it('allows DELETE for demo admin', () => {
    expect(shouldBlockDemoWrite('/api/admin/tasks/abc', 'DELETE', demoAdmin)).toBe(false)
  })

  it('allows POST for normal venue manager', () => {
    expect(shouldBlockDemoWrite('/api/admin/tasks', 'POST', normalManager)).toBe(false)
  })

  it('allows POST for normal venue admin', () => {
    expect(shouldBlockDemoWrite('/api/admin/tasks', 'POST', normalAdmin)).toBe(false)
  })

  it('allows POST on non-admin API path', () => {
    expect(shouldBlockDemoWrite('/api/worker/tasks', 'POST', demoManager)).toBe(false)
  })

  it('allows POST on admin page (not API)', () => {
    expect(shouldBlockDemoWrite('/admin/settings', 'POST', demoManager)).toBe(false)
  })

  it('allows when token is null', () => {
    expect(shouldBlockDemoWrite('/api/admin/tasks', 'POST', null)).toBe(false)
  })

  it('allows when token has no venueIsDemo', () => {
    expect(shouldBlockDemoWrite('/api/admin/tasks', 'POST', { role: 'MANAGER' })).toBe(false)
  })
})
