import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SyncClient } from '@/app/admin/(protected)/sync/SyncClient'

describe('SyncClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockImplementation((() =>
      Promise.resolve({
        ok: true,
        json: async () => [],
      } as Response)) as typeof fetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading state on mount', () => {
    render(<SyncClient />)
    expect(screen.getByText('LOADING')).toBeTruthy()
  })

  it('renders without crashing (hooks ordered correctly)', () => {
    const { container } = render(<SyncClient />)
    expect(container).toBeTruthy()
  })

  it('calls the sync log API on mount', () => {
    render(<SyncClient />)
    expect(fetch).toHaveBeenCalledWith('/api/admin/sync/log?')
  })

  it('renders the WOOCOMMERCE SYNC heading after load', async () => {
    render(<SyncClient />)
    await waitFor(() => {
      expect(screen.getByText('WOOCOMMERCE SYNC')).toBeTruthy()
    })
  })

  it('shows the empty state when there is no activity', async () => {
    render(<SyncClient />)
    await waitFor(() => {
      expect(screen.getByText('NO SYNC ACTIVITY YET')).toBeTruthy()
    })
  })

  it('renders PULL and PUSH buttons', async () => {
    render(<SyncClient />)
    await waitFor(() => {
      expect(screen.getByText('↓ PULL PRODUCTS NOW')).toBeTruthy()
      expect(screen.getByText('↑ PUSH PRODUCTS NOW')).toBeTruthy()
    })
  })

  it('renders log rows with status badges and error styling', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'log-1',
          direction: 'PULL',
          entity: 'PRODUCT',
          status: 'SUCCESS',
          externalId: '42',
          message: 'PULLED 10 PRODUCTS',
          createdAt: '2026-07-15T02:00:00Z',
        },
        {
          id: 'log-2',
          direction: 'PUSH',
          entity: 'ORDER',
          status: 'ERROR',
          externalId: '9',
          message: 'ORDER STATUS PUSH FAILED FOR #9 — HTTP 500',
          createdAt: '2026-07-15T02:01:00Z',
        },
      ],
    })
    render(<SyncClient />)
    await waitFor(() => {
      expect(screen.getByText('PULLED 10 PRODUCTS')).toBeTruthy()
      expect(screen.getByText('ORDER STATUS PUSH FAILED FOR #9 — HTTP 500')).toBeTruthy()
      expect(screen.getAllByText('ERROR').length).toBeGreaterThan(0)
    })
  })

  it('renders direction and status filter selects', async () => {
    render(<SyncClient />)
    await waitFor(() => {
      expect(screen.getByText('ALL DIRECTIONS')).toBeTruthy()
      expect(screen.getByText('ALL STATUSES')).toBeTruthy()
    })
  })
})
