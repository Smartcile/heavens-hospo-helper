import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  params: new URLSearchParams(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.params,
}))

import { SettingsClient } from '@/components/admin/SettingsClient'

const props = { staffId: 's1', role: 'ADMIN', sessionVenueId: 'v1', defaultVenueId: 'v1', venueIsDemo: false }

describe('SettingsClient tabs', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    mocks.params = new URLSearchParams()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const res = (data: unknown) => ({ ok: true, json: async () => data }) as Response
      if (url.includes('/api/admin/venues')) return res([{ id: 'v1', name: 'TEST VENUE' }])
      return res([])
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the settings tab labels with GENERAL active by default', () => {
    render(<SettingsClient {...props} />)
    for (const label of ['GENERAL', 'STRUCTURE', 'UNITS OF MEASURE', 'SUPPLIERS', 'QR CODES', 'SWIFT POS', 'FILES', 'UPDATES']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.queryByRole('button', { name: 'SYNC' })).toBeNull()
    // Floor plans moved to Events → Rooms & Plans.
    expect(screen.queryByRole('button', { name: 'FLOOR PLANS' })).toBeNull()
    expect(screen.getByText('INTEGRATIONS')).toBeTruthy()
  })

  it('hides the admin-only FILES tab from managers', () => {
    mocks.params = new URLSearchParams('tab=files')
    render(<SettingsClient {...props} role="MANAGER" />)
    expect(screen.queryByRole('button', { name: 'FILES' })).toBeNull()
    // A manager landing on ?tab=files falls back to the GENERAL tab.
    expect(screen.getByText('INTEGRATIONS')).toBeTruthy()
  })

  it('hides the admin-only UPDATES tab from managers', () => {
    mocks.params = new URLSearchParams('tab=updates')
    render(<SettingsClient {...props} role="MANAGER" />)
    expect(screen.queryByRole('button', { name: 'UPDATES' })).toBeNull()
    expect(screen.getByText('INTEGRATIONS')).toBeTruthy()
  })

  it('no longer exposes a FLOOR PLANS tab', () => {
    mocks.params = new URLSearchParams('tab=floorplans')
    render(<SettingsClient {...props} role="MANAGER" grantedAreas={['compliance']} />)
    expect(screen.queryByRole('button', { name: 'FLOOR PLANS' })).toBeNull()
    // Landing on ?tab=floorplans falls back to GENERAL.
    expect(screen.getByText('INTEGRATIONS')).toBeTruthy()
  })

  it('lets a floorplans-granted manager still open settings (fallback to GENERAL)', () => {
    mocks.params = new URLSearchParams('tab=floorplans')
    render(<SettingsClient {...props} role="MANAGER" grantedAreas={['floorplans']} />)
    expect(screen.queryByRole('button', { name: 'FLOOR PLANS' })).toBeNull()
    expect(screen.getByText('INTEGRATIONS')).toBeTruthy()
  })

  it('switching a tab pushes the settings URL', () => {
    render(<SettingsClient {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'SWIFT POS' }))
    expect(mocks.push).toHaveBeenCalledWith('/admin/settings?tab=swiftpos', { scroll: false })
  })

  it('mounts the UOMS tab from the URL', async () => {
    mocks.params = new URLSearchParams('tab=uoms')
    render(<SettingsClient {...props} />)
    expect((await screen.findAllByText('UNITS OF MEASURE')).length).toBeGreaterThan(0)
  })

})

describe('SettingsClient — worker session timeout', () => {
  const VENUE = {
    id: 'v1',
    name: 'TEST VENUE',
    loadedRosterUrl: null,
    googleCalendarUrl: null,
    icalFeedUrl: null,
    externalRefreshMinutes: 0,
    availabilityLockDays: 0,
    availabilityCutoff: null,
    availabilityPresets: null,
    workerSessionTimeoutMinutes: 15,
    sharingEnabled: false,
  }

  let fetchMock: ReturnType<typeof installFetchMock>

  function response(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response
  }

  function installFetchMock() {
    return vi
      .spyOn(global, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'

        if (url === '/api/admin/venues' && method === 'GET') return response([VENUE])
        if (url.startsWith('/api/admin/venues/') && method === 'PUT') {
          const body = JSON.parse(String(init?.body))
          return response({ ...VENUE, ...body })
        }
        if (url.startsWith('/api/admin/calendar-feeds')) {
          return response({ feeds: [], areas: [], floorPlans: [] })
        }
        if (url.startsWith('/api/admin/api-keys')) return response([])
        if (url.startsWith('/api/admin/settings/demo-venue')) return response({ venue: null })
        return response({})
      })
  }

  function workerSessionSection() {
    const heading = screen.getByRole('heading', { name: 'WORKER SESSION' })
    return heading.closest('div') as HTMLElement
  }

  function timeoutInput() {
    return within(workerSessionSection()).getByRole('spinbutton') as HTMLInputElement
  }

  function saveButton() {
    return within(workerSessionSection()).getByRole('button', { name: 'SAVE' })
  }

  function putBodies() {
    return fetchMock.mock.calls
      .filter(
        ([url, init]) =>
          String(url).startsWith('/api/admin/venues/') &&
          (init as RequestInit | undefined)?.method === 'PUT'
      )
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
  }

  async function renderSettings() {
    render(<SettingsClient {...props} />)
    await waitFor(() => expect(screen.getByText('WORKER SESSION')).toBeTruthy())
  }

  beforeEach(() => {
    mocks.push.mockClear()
    mocks.params = new URLSearchParams()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock = installFetchMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects a value outside 5–480 without saving', async () => {
    await renderSettings()

    fireEvent.change(timeoutInput(), { target: { value: '4' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.getByText(/ENTER 5.480 MINUTES/)).toBeTruthy())

    fireEvent.change(timeoutInput(), { target: { value: '481' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.getByText(/ENTER 5.480 MINUTES/)).toBeTruthy())

    expect(putBodies()).toHaveLength(0)
  })

  it('maps a blank or 0 value to null and a valid value to its number', async () => {
    await renderSettings()

    fireEvent.change(timeoutInput(), { target: { value: '120' } })
    fireEvent.click(saveButton())
    await waitFor(() =>
      expect(putBodies()).toContainEqual({ workerSessionTimeoutMinutes: 120 })
    )

    fireEvent.change(timeoutInput(), { target: { value: '0' } })
    fireEvent.click(saveButton())
    await waitFor(() =>
      expect(putBodies()).toContainEqual({ workerSessionTimeoutMinutes: null })
    )

    fireEvent.change(timeoutInput(), { target: { value: '' } })
    fireEvent.click(saveButton())
    await waitFor(() =>
      expect(putBodies()).toContainEqual({ workerSessionTimeoutMinutes: null })
    )
  })

  it('saves the staff comment-delete toggle from the roster availability block', async () => {
    await renderSettings()

    const toggle = screen.getByLabelText('Staff may delete their own availability comments')
    expect(toggle.textContent).toBe('OFF')
    fireEvent.click(toggle)
    expect(toggle.textContent).toBe('ON')

    const heading = screen.getByRole('heading', { name: 'ROSTER AVAILABILITY' })
    const section = heading.closest('div') as HTMLElement
    fireEvent.click(within(section).getByRole('button', { name: 'SAVE' }))

    await waitFor(() =>
      expect(putBodies()).toContainEqual(
        expect.objectContaining({ staffCanDeleteAvailabilityComments: true })
      )
    )
  })
})
