import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { TrainingStatusClient } from '@/components/admin/TrainingStatusClient'

const payload = {
  venueName: 'MAIN',
  date: '2026-10-27',
  staff: [
    {
      id: 's1',
      name: 'SMITH, JANE',
      positions: ['BARISTA'],
      positionIds: ['p1'],
      onShift: true,
      requiredCount: 2,
      completedCount: 2,
      missingCount: 0,
      staleCount: 0,
      missingGuides: [],
      staleGuides: [],
      openFollowUps: 0,
      level: 'GREEN',
    },
  ],
  positions: [{ id: 'p1', name: 'BARISTA', colour: '#4ADE80' }],
  summary: { green: 1, yellow: 0, red: 0 },
}

const reviews = [
  {
    id: 'r1',
    staffName: 'SMITH, JANE',
    sectionName: 'BAR',
    source: 'GUIDES',
    status: 'PENDING',
    evidenceLabel: '2 GUIDES COMPLETE',
    requestedAt: '2026-10-27T00:00:00.000Z',
    note: null,
  },
]

function mockFetch(actionResponse?: { ok: boolean; status: number; error?: string }) {
  return vi.spyOn(global, 'fetch').mockImplementation((url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/api/admin/section-work/')) {
      if (actionResponse && !actionResponse.ok) {
        return Promise.resolve({
          ok: false,
          status: actionResponse.status,
          json: async () => ({ error: actionResponse.error }),
        } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: 'r1', status: 'CONFIRMED' }) } as Response)
    }
    if (u.includes('/api/admin/section-work')) {
      return Promise.resolve({ ok: true, json: async () => ({ reviews }) } as Response)
    }
    if (u.includes('/api/admin/staff/') && u.includes('/guides')) {
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) } as Response)
    }
    if (u.includes('/api/admin/guides')) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => payload } as Response)
  })
}

describe('TrainingStatusClient board', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('groups staff by position and shows outstanding guide titles', async () => {
    const grouped = {
      ...payload,
      positions: [
        { id: 'p1', name: 'BARISTA', colour: '#4ADE80' },
        { id: 'p2', name: 'DUTY MANAGER', colour: '#60A5FA' },
      ],
      staff: [
        {
          ...payload.staff[0],
          missingGuides: ['MILK STATION', 'OPENING LIST'],
          staleGuides: ['COFFEE MENU UPDATE'],
          missingCount: 2,
          staleCount: 1,
          level: 'RED',
        },
        {
          ...payload.staff[0],
          id: 's2',
          name: 'LEE, ANN',
          positions: ['DUTY MANAGER'],
          positionIds: ['p2'],
          onShift: false,
          missingGuides: [],
          staleGuides: [],
          missingCount: 0,
          staleCount: 0,
          level: 'GREEN',
        },
      ],
    }
    vi.spyOn(global, 'fetch').mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('/api/admin/section-work')) {
        return { ok: true, json: async () => ({ reviews: [] }) } as Response
      }
      return { ok: true, json: async () => grouped } as Response
    })

    const { getByText, getAllByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )

    await waitFor(() => expect(getByText('BARISTA (1)')).toBeTruthy())
    expect(getByText('DUTY MANAGER (1)')).toBeTruthy()
    expect(getByText(/TO DO: MILK STATION · OPENING LIST/)).toBeTruthy()
    expect(getByText(/RETRAIN: COFFEE MENU UPDATE/)).toBeTruthy()
    expect(getAllByText('MANAGE GUIDES →').length).toBe(2)
  })

  it('opens the staff guides modal from a row', async () => {
    mockFetch()
    const { getByText, getAllByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )

    await waitFor(() => expect(getByText('BARISTA (1)')).toBeTruthy())
    fireEvent.click(getAllByText('MANAGE GUIDES →')[0])

    await waitFor(() => expect(getByText('GUIDES — SMITH, JANE')).toBeTruthy())
  })
})

describe('TrainingStatusClient warnings', () => {
  afterEach(() => { vi.restoreAllMocks() })

  const warnings = [
    {
      id: 'request:r1',
      kind: 'RETRAIN_REQUESTED',
      severity: 'WARNING',
      staffId: 's1',
      staffName: 'SMITH, JANE',
      guideId: 'g1',
      guideTitle: 'COFFEE MENU',
      folderId: 'f1',
      folderName: 'BAR',
      reasonText: 'Marked for retraining on 10 NOV 2026 — MENU CHANGED.',
      since: '2026-11-10T00:00:00.000Z',
      due: '2026-11-24T00:00:00.000Z',
      requestId: 'r1',
      followUpId: null,
    },
  ]

  function mockWarningsFetch(opts: { canAssign?: boolean; canSignOff?: boolean } = {}) {
    return vi.spyOn(global, 'fetch').mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('/api/admin/guide-warnings')) {
        return {
          ok: true,
          json: async () => ({
            ...payload,
            warnings,
            folders: [{ id: 'f1', name: 'BAR', sortOrder: 0 }],
            staff: [{ id: 's1', name: 'SMITH, JANE' }],
            guides: [{ id: 'g1', title: 'COFFEE MENU', folderId: 'f1' }],
            canAssign: opts.canAssign !== false,
            canSignOff: opts.canSignOff !== false,
          }),
        } as Response
      }
      if (u.includes('/api/admin/section-work')) {
        return { ok: true, json: async () => ({ reviews: [] }) } as Response
      }
      return { ok: true, json: async () => payload } as Response
    })
  }

  it('renders the warning reason and marks the person retrained', async () => {
    const spy = mockWarningsFetch()
    const { getByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )

    await waitFor(() => expect(getByText('WARNINGS (1)')).toBeTruthy())
    expect(getByText(/Marked for retraining on 10 NOV 2026/)).toBeTruthy()
    expect(getByText(/COFFEE MENU/)).toBeTruthy()

    fireEvent.click(getByText('MARK RETRAINED'))

    await waitFor(() => {
      const complete = spy.mock.calls.find(
        (c) => String(c[0]).includes('/api/admin/guides/complete') && c[1]?.method === 'POST',
      )
      expect(complete).toBeDefined()
      expect(JSON.parse((complete![1] as RequestInit).body as string)).toEqual({
        guideId: 'g1',
        staffId: 's1',
      })
    })
    await waitFor(() => {
      const resolve = spy.mock.calls.find(
        (c) => String(c[0]).includes('/api/admin/guide-retrain/r1') && c[1]?.method === 'PATCH',
      )
      expect(resolve).toBeDefined()
      expect(JSON.parse((resolve![1] as RequestInit).body as string)).toEqual({ action: 'RESOLVE' })
    })
  })

  it('hides actions the manager is not granted', async () => {
    mockWarningsFetch({ canAssign: false, canSignOff: false })
    const { getByText, queryByText, queryAllByText } = render(
      <TrainingStatusClient role="MANAGER" sessionVenueId="v1" defaultVenueId="v1" />,
    )

    await waitFor(() => expect(getByText('WARNINGS (1)')).toBeTruthy())
    expect(queryByText('MARK RETRAINED')).toBeNull()
    expect(queryByText('DISMISS')).toBeNull()
    expect(queryAllByText('MARK FOR RETRAINING')).toHaveLength(0)
    // Reading/opening the guide is still allowed.
    expect(getByText('OPEN GUIDE')).toBeTruthy()
  })

  it('groups warnings by folder while keeping the flat option', async () => {
    mockWarningsFetch()
    const { getByText, queryByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )

    await waitFor(() => expect(getByText('BY FOLDER')).toBeTruthy())
    fireEvent.click(getByText('BY FOLDER'))
    await waitFor(() => expect(getByText('BAR (1)')).toBeTruthy())
    fireEvent.click(getByText('FLAT'))
    await waitFor(() => expect(queryByText('BAR (1)')).toBeNull())
    expect(getByText(/COFFEE MENU/)).toBeTruthy()
  })

  it('dismisses an explicit retrain request', async () => {
    const spy = mockWarningsFetch()
    const { getByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )

    await waitFor(() => expect(getByText('DISMISS')).toBeTruthy())
    fireEvent.click(getByText('DISMISS'))

    await waitFor(() => {
      const call = spy.mock.calls.find(
        (c) => String(c[0]).includes('/api/admin/guide-retrain/r1') && c[1]?.method === 'PATCH',
      )
      expect(call).toBeDefined()
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ action: 'DISMISS' })
    })
  })
})

describe('TrainingStatusClient section reviews', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders a pending section review with its evidence', async () => {
    mockFetch()
    const { getByText, getAllByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )
    await waitFor(() => expect(getByText('SECTION REVIEWS (1)')).toBeTruthy())
    expect(getAllByText('SMITH, JANE').length).toBeGreaterThanOrEqual(2)
    expect(getAllByText(/BAR/).length).toBeGreaterThan(0)
    expect(getByText('2 GUIDES COMPLETE')).toBeTruthy()
  })

  it('POSTs CONFIRM and removes the row from the queue', async () => {
    const spy = mockFetch()
    const { getByText, queryByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )
    await waitFor(() => expect(getByText('CONFIRM')).toBeTruthy())

    fireEvent.click(getByText('CONFIRM'))

    await waitFor(() => {
      const post = spy.mock.calls.find(
        (c) => String(c[0]).includes('/api/admin/section-work/r1') && c[1]?.method === 'POST',
      )
      expect(post).toBeDefined()
      expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ action: 'CONFIRM' })
    })
    await waitFor(() => expect(queryByText('2 GUIDES COMPLETE')).toBeNull())
  })

  it('POSTs DISMISS and keeps the review available to reopen', async () => {
    const spy = mockFetch()
    const { getByText, queryByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )
    await waitFor(() => expect(getByText('DISMISS')).toBeTruthy())

    fireEvent.click(getByText('DISMISS'))

    await waitFor(() => {
      const post = spy.mock.calls.find(
        (c) => String(c[0]).includes('/api/admin/section-work/r1') && c[1]?.method === 'POST',
      )
      expect(post).toBeDefined()
      expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ action: 'DISMISS' })
    })
    await waitFor(() => expect(getByText(/DISMISSED REVIEWS \(1\)/)).toBeTruthy())
    // Dismissed reviews are collapsed until the manager asks to see them.
    expect(queryByText(/2 GUIDES COMPLETE/)).toBeNull()

    fireEvent.click(getByText(/DISMISSED REVIEWS \(1\)/))
    await waitFor(() => expect(getByText(/2 GUIDES COMPLETE/)).toBeTruthy())
    expect(getByText('REOPEN')).toBeTruthy()
  })

  it('surfaces a failed CONFIRM (e.g. 403) instead of silently dropping it', async () => {
    mockFetch({ ok: false, status: 403, error: 'Forbidden' })
    const { getByText, queryByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )
    await waitFor(() => expect(getByText('CONFIRM')).toBeTruthy())

    fireEvent.click(getByText('CONFIRM'))

    await waitFor(() => expect(getByText(/CONFIRM FAILED — 403/)).toBeTruthy())
    // The review stays in the queue so the manager can retry.
    expect(queryByText('2 GUIDES COMPLETE')).toBeTruthy()
  })
})
