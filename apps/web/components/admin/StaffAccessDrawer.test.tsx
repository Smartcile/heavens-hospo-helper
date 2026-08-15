import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StaffAccessDrawer } from './StaffAccessDrawer'

const ACCESS_DATA = {
  restricted: false,
  venueId: 'v1',
  staffVenues: [],
  permissions: [],
}

const VENUES = [{ id: 'v1', name: 'THE TESTURANT' }]

describe('StaffAccessDrawer', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, _init?: RequestInit) =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(ACCESS_DATA),
        } as Response),
      ),
    )
  })

  it('renders the access tree with presets and a restricted toggle', async () => {
    render(<StaffAccessDrawer staffId="s1" staffName="JANE SMITH" staffRole="MANAGER" venues={VENUES} onClose={() => {}} />)
    expect(await screen.findByText('ACCESS — JANE SMITH')).toBeTruthy()
    expect(screen.getByText('FULL ACCESS')).toBeTruthy()
    expect(screen.getByText('BAR MANAGER')).toBeTruthy()
    expect(screen.getByText('KITCHEN MANAGER')).toBeTruthy()
    expect(screen.getByText('H&S OFFICER')).toBeTruthy()
    expect(screen.getByText('PAYROLL')).toBeTruthy()
    expect(screen.getByText('COMPLIANCE')).toBeTruthy()
  })

  it('applying a preset checks its keys and grants the implied views', async () => {
    render(<StaffAccessDrawer staffId="s1" staffName="JANE SMITH" staffRole="MANAGER" venues={VENUES} onClose={() => {}} />)
    await screen.findByText('ACCESS — JANE SMITH')

    fireEvent.click(screen.getByText('H&S OFFICER'))

    // H&S OFFICER grants 9 compliance keys: tasks view/create/edit,
    // deliveries view/create/edit, alerts view/raise/resolve.
    const areaBlock = screen.getByText('COMPLIANCE').closest('div') as HTMLElement
    const checked = areaBlock.querySelectorAll('input[type="checkbox"]:checked')
    expect(checked.length).toBe(9)
  })

  it('saves the restricted flag and grants per venue', async () => {
    const onClose = vi.fn()
    render(<StaffAccessDrawer staffId="s1" staffName="JANE SMITH" staffRole="MANAGER" venues={VENUES} onClose={onClose} />)
    await screen.findByText('ACCESS — JANE SMITH')

    fireEvent.click(screen.getByLabelText('RESTRICTED — GRANTS ONLY'))
    fireEvent.click(screen.getByText('SAVE ACCESS'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())

    const fetchMock = vi.mocked(fetch)
    const putCall = fetchMock.mock.calls.find(([u, init]) => String(u).includes('/permissions') && (init as RequestInit)?.method === 'PUT')!
    expect(putCall).toBeDefined()
    const body = JSON.parse(String((putCall[1] as RequestInit).body))
    expect(body.restricted).toBe(true)
    expect(body.grants).toEqual([{ venueId: 'v1', keys: [] }])
  })
})
