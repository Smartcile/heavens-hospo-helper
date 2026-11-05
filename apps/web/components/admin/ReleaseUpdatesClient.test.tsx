import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReleaseUpdatesClient } from './ReleaseUpdatesClient'

const DATA = {
  version: '1005',
  generatedAt: '2026-11-05T00:00:00.000Z',
  repo: 'o/r',
  issues: [
    { number: 1, title: '[UI] CLOSED ONE', state: 'CLOSED', url: 'u1', closedAt: '2026-01-01', labels: [] },
    { number: 2, title: '[UI] CLOSED TWO', state: 'CLOSED', url: 'u2', closedAt: '2026-01-02', labels: [] },
    { number: 3, title: '[ORDERS] OPEN ONE', state: 'OPEN', url: 'u3', closedAt: null, labels: [] },
  ],
  confirmations: [{ issueNumber: 1, confirmedAt: '2026-11-05T01:00:00.000Z', note: null }],
  progress: { total: 2, confirmed: 1, percent: 50 },
}

function response(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body } as Response
}

function installFetch(put: (url: string, init?: RequestInit) => Promise<Response>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/admin/updates') return response(DATA)
    if (url.startsWith('/api/admin/updates/')) return put(url, init)
    return response({})
  })
}

function checkboxes() {
  return screen.getAllByRole('checkbox') as HTMLInputElement[]
}

function checkboxFor(number: number) {
  return screen.getByLabelText(`Verify issue ${number}`) as HTMLInputElement
}

describe('ReleaseUpdatesClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders CLOSED rows, groups and progress', async () => {
    installFetch(async () => response({ confirmed: true }))
    render(<ReleaseUpdatesClient />)

    expect(await screen.findByText('#1 [UI] CLOSED ONE')).toBeTruthy()
    expect(screen.getByText('#2 [UI] CLOSED TWO')).toBeTruthy()
    expect(screen.queryByText('#3 [ORDERS] OPEN ONE')).toBeNull()
    expect(screen.getByText('1/2 VERIFIED')).toBeTruthy()
    expect(screen.getByText('UI')).toBeTruthy()
    expect(checkboxes()).toHaveLength(2)
    expect(checkboxFor(1).checked).toBe(true)
    expect(checkboxFor(2).checked).toBe(false)
  })

  it('ticks optimistically and fires one PUT for the row', async () => {
    let settle: (value: Response) => void = () => {}
    const pending = new Promise<Response>((resolve) => {
      settle = resolve
    })
    const fetchMock = installFetch(async () => pending)

    render(<ReleaseUpdatesClient />)
    await screen.findByText('#2 [UI] CLOSED TWO')

    fireEvent.click(checkboxFor(2))

    // Optimistic: checked before the request resolves.
    expect(checkboxFor(2).checked).toBe(true)
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/updates/2',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ version: '1005', confirmed: true }),
        }),
      ),
    )

    settle(response({ confirmed: true }))
    expect(await screen.findByText('SAVED')).toBeTruthy()
    expect(checkboxFor(2).checked).toBe(true)
  })

  it('reverts the tick and shows an inline error when the save fails', async () => {
    installFetch(async () => response({ error: 'SAVE FAILED' }, false))
    render(<ReleaseUpdatesClient />)
    await screen.findByText('#2 [UI] CLOSED TWO')

    fireEvent.click(checkboxFor(2))

    await waitFor(() => expect(checkboxFor(2).checked).toBe(false))
    expect(screen.getByText('SAVE FAILED')).toBeTruthy()
  })

  it('shows OPEN issues after the toggle and updates progress', async () => {
    installFetch(async () => response({ confirmed: true }))
    render(<ReleaseUpdatesClient />)
    await screen.findByText('#1 [UI] CLOSED ONE')

    fireEvent.click(screen.getByRole('button', { name: 'OPEN' }))

    expect(await screen.findByText('#3 [ORDERS] OPEN ONE')).toBeTruthy()
    expect(screen.queryByText('#1 [UI] CLOSED ONE')).toBeNull()
    expect(screen.getByText('0/1 VERIFIED')).toBeTruthy()
    expect(screen.getByText('ORDERS')).toBeTruthy()
  })

  it('shows the fixed date on rows and can group by fixed date', async () => {
    installFetch(async () => response({ confirmed: true }))
    render(<ReleaseUpdatesClient />)
    await screen.findByText('#1 [UI] CLOSED ONE')

    // Rows carry an explicit fixed date.
    expect(screen.getAllByText('FIXED 01 JAN 2026').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'VIEW: FIXED DATE' }))

    // Group headers are now the fixed day (header + row label for each issue).
    await waitFor(() => expect(screen.getAllByText('FIXED 02 JAN 2026').length).toBeGreaterThanOrEqual(2))
    expect(screen.getAllByText('FIXED 01 JAN 2026').length).toBeGreaterThanOrEqual(2)
  })

  it('filters the worklist and progress by search', async () => {
    installFetch(async () => response({ confirmed: true }))
    render(<ReleaseUpdatesClient />)
    await screen.findByText('#1 [UI] CLOSED ONE')

    fireEvent.change(screen.getByLabelText('Search issues'), { target: { value: 'TWO' } })

    await waitFor(() => expect(screen.queryByText('#1 [UI] CLOSED ONE')).toBeNull())
    expect(screen.getByText('#2 [UI] CLOSED TWO')).toBeTruthy()
    expect(screen.getByText('0/1 VERIFIED')).toBeTruthy()
  })
})
