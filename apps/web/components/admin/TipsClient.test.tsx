import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TipsClient } from '@/components/admin/TipsClient'

const PERIOD = {
  id: 't1',
  venueId: 'v1',
  label: 'FEBRUARY 2026',
  fromDate: '2026-02-01T00:00:00.000Z',
  toDate: '2026-02-28T00:00:00.000Z',
  cashCounts: {},
  posTotal: 1000,
  notes: null,
  poolTotal: 1000,
  shares: [
    {
      id: 'r1',
      staffId: 's1',
      name: 'LIAM SMITH',
      hours: 705,
      shareWeight: 1,
      sortOrder: 0,
      status: 'PLANNED',
      approvalNote: null,
      issueNote: null,
    },
    {
      id: 'r2',
      staffId: 's2',
      name: 'SHAYLA JONES',
      hours: 634,
      shareWeight: 1,
      sortOrder: 1,
      status: 'APPROVED',
      approvalNote: 'CHECKED',
      issueNote: null,
    },
  ],
}

const json = (data: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) } as Response)

function mockFetch(periods: unknown[] = [PERIOD]) {
  return vi.fn((url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.startsWith('/api/admin/tips/staff-options')) return json([])
    if (u.includes('/shares/')) return json({ ok: true })
    if (u.startsWith('/api/admin/tips')) {
      const method = init?.method ?? 'GET'
      if (method === 'POST') return json({ ...PERIOD, id: 'new1' })
      if (method === 'PUT') return json(periods[0])
      if (method === 'DELETE') return json({ success: true })
      return json(periods)
    }
    return json([])
  }) as unknown as typeof fetch
}

function methodCalls(method: string) {
  const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
  return calls.filter((c) => ((c[1] as RequestInit | undefined)?.method ?? 'GET') === method)
}

describe('TipsClient', () => {
  beforeEach(() => {
    globalThis.fetch = mockFetch()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the pool, per-person amounts and approval status', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    expect(screen.getAllByText('$1,000.00').length).toBeGreaterThan(0)
    expect(screen.getByText('LIAM SMITH')).toBeTruthy()
    expect(screen.getByText('SHAYLA JONES')).toBeTruthy()
    expect(screen.getAllByText('$500.00').length).toBeGreaterThan(0)
    // Hours share: 705 / 1339 = 52.7%
    expect(screen.getByText('52.7%')).toBeTruthy()
    expect(screen.getByText('APPROVED')).toBeTruthy()
  })

  it('adds a manual person to the breakdown', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('+ ADD PERSON'))
    expect(screen.getByLabelText('Staff 3 name')).toBeTruthy()
  })

  it('approves a planned share with a note', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('CHECKED IN CASH')
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('APPROVE'))

    await waitFor(() => {
      const patches = methodCalls('PATCH')
      expect(patches.length).toBe(1)
      expect(String(patches[0][0])).toContain('/api/admin/tips/t1/shares/r1')
      const body = JSON.parse((patches[0][1] as RequestInit).body as string)
      expect(body).toEqual({ action: 'APPROVE', note: 'CHECKED IN CASH' })
    })
  })

  it('keeps unsaved form edits when one person is approved', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('CHECKED')
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    const hours = screen.getByLabelText('Staff 1 hours') as HTMLInputElement
    fireEvent.change(hours, { target: { value: '999' } })
    fireEvent.change(screen.getByLabelText('EFTPOS / POS holding (from finance)'), {
      target: { value: '1234' },
    })

    fireEvent.click(screen.getByText('APPROVE'))

    await waitFor(() => {
      expect(methodCalls('PATCH').length).toBe(1)
      expect((screen.getByLabelText('Staff 1 hours') as HTMLInputElement).value).toBe('999')
      expect(
        (screen.getByLabelText('EFTPOS / POS holding (from finance)') as HTMLInputElement).value,
      ).toBe('1234')
    })
  })

  it('saves shares by id without sending dollar amounts', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('SAVE PERIOD'))

    await waitFor(() => {
      const puts = methodCalls('PUT')
      expect(puts.length).toBe(1)
      expect(String(puts[0][0])).toContain('/api/admin/tips/t1')
      const body = JSON.parse((puts[0][1] as RequestInit).body as string)
      expect(body.posTotal).toBe(1000)
      expect(body.shares).toHaveLength(2)
      expect(body.shares[0]).toMatchObject({ id: 'r1', staffId: 's1', hours: 705, shareWeight: 1 })
      expect(body.shares[0]).not.toHaveProperty('amount')
    })
  })

  it('creates a new period with a POST', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('+ NEW PERIOD'))
    fireEvent.click(screen.getByText('SAVE PERIOD'))

    await waitFor(() => {
      const posts = methodCalls('POST')
      expect(posts.length).toBe(1)
      const body = JSON.parse((posts[0][1] as RequestInit).body as string)
      expect(body.venueId).toBe('v1')
    })
  })

  it('links the admin-only distribution PDF once a period is saved', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())
    const link = screen.getByText('⬇ DOWNLOAD DISTRIBUTION PDF').closest('a')
    expect(link?.getAttribute('href')).toBe('/api/admin/tips/t1/pdf')
  })

  it('soft-deletes a period after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('DELETE'))

    await waitFor(() => {
      expect(methodCalls('DELETE').length).toBe(1)
    })
  })
})

const STAFF = [
  { id: 's1', name: 'LIAM SMITH', departmentName: 'FOH' },
  { id: 's2', name: 'SHAYLA JONES', departmentName: 'FOH' },
  { id: 's3', name: 'RUI CHEN', departmentName: 'KITCHEN' },
]

function mockFull(notes: unknown[] = []) {
  return vi.fn((url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.startsWith('/api/admin/tips/staff-options')) return json(STAFF)
    if (u.includes('/notes')) {
      const method = init?.method ?? 'GET'
      if (method === 'POST') {
        return json({ note: { id: 'n2', body: 'OK', source: 'MANAGER', authorName: 'ADMIN', createdAt: '2026-11-12T04:00:00.000Z', canDelete: true } })
      }
      if (method === 'DELETE') return json({ success: true })
      return json({ notes, canAdd: true, canDelete: true })
    }
    if (u.includes('/shares/')) return json({ ok: true })
    if (u.startsWith('/api/admin/tips')) {
      const method = init?.method ?? 'GET'
      if (method === 'POST') return json({ ...PERIOD, id: 'new1' })
      if (method === 'PUT') return json(PERIOD)
      if (method === 'DELETE') return json({ success: true })
      return json([PERIOD])
    }
    return json([])
  }) as unknown as typeof fetch
}

function headerLabels(): string[] {
  return screen
    .getAllByRole('columnheader')
    .map((th) => (th.textContent ?? '').replace(/[^A-Z0-9% ]/gi, '').trim())
}

describe('TipsClient layout, columns, bulk, notes and import', () => {
  beforeEach(() => {
    localStorage.clear()
    globalThis.fetch = mockFull()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders a full-width table with the default column order', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    expect(screen.getByRole('table')).toBeTruthy()
    expect(headerLabels()).toEqual([
      'NAME',
      'HOURS',
      'WEIGHT',
      'HOURS %',
      'SUGGESTED',
      'AMOUNT',
      'STATUS',
      'ACTIONS',
    ])
  })

  it('restores a saved column order and persists a drag', async () => {
    localStorage.setItem('hospo-tips-columns:v1', JSON.stringify(['AMOUNT', 'NAME']))
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())
    expect(headerLabels().slice(0, 3)).toEqual(['AMOUNT', 'NAME', 'HOURS'])

    const nameHeader = screen.getByRole('columnheader', { name: /NAME/ })
    const actionsHeader = screen.getByRole('columnheader', { name: /ACTIONS/ })
    fireEvent.dragStart(nameHeader)
    fireEvent.dragOver(actionsHeader)
    fireEvent.drop(actionsHeader)

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('hospo-tips-columns:v1') ?? '[]') as string[]
      expect(saved.indexOf('NAME')).toBe(saved.indexOf('ACTIONS') - 1)
    })
  })

  it('resets a saved column order with RESET ORDER', async () => {
    localStorage.setItem('hospo-tips-columns:v1', JSON.stringify(['AMOUNT', 'NAME']))
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())
    expect(headerLabels()[0]).toBe('AMOUNT')

    fireEvent.click(screen.getByText('RESET ORDER'))

    await waitFor(() => expect(headerLabels()[0]).toBe('NAME'))
    expect(localStorage.getItem('hospo-tips-columns:v1')).toBeNull()
  })

  it('sorts rows from a header click and resets with a third click', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    const nameHeader = screen.getByRole('columnheader', { name: /NAME/ })
    const sortButton = nameHeader.querySelector('button') as HTMLButtonElement
    const firstBodyRow = () => screen.getAllByRole('row')[1].textContent ?? ''

    expect(firstBodyRow()).toContain('LIAM SMITH')
    fireEvent.click(sortButton) // asc
    expect(firstBodyRow()).toContain('LIAM SMITH')
    fireEvent.click(sortButton) // desc
    await waitFor(() => expect(firstBodyRow()).toContain('SHAYLA JONES'))
    fireEvent.click(sortButton) // back to manual
    await waitFor(() => expect(firstBodyRow()).toContain('LIAM SMITH'))
  })

  it('bulk-adds selected staff and saves them in the period payload', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('+ ADD STAFF'))
    await screen.findByText('ADD STAFF TO THIS PERIOD')
    fireEvent.click(screen.getByLabelText('Select RUI CHEN'))
    fireEvent.click(screen.getByText('ADD SELECTED (1)'))

    await waitFor(() => expect(screen.getAllByText('RUI CHEN').length).toBeGreaterThan(0))

    fireEvent.click(screen.getByText('SAVE PERIOD'))
    await waitFor(() => {
      const puts = methodCalls('PUT')
      expect(puts.length).toBe(1)
      const body = JSON.parse((puts[0][1] as RequestInit).body as string)
      expect(body.shares.map((s: { staffId: string }) => s.staffId)).toContain('s3')
    })
  })

  it('opens the notes thread, shows history and posts a note', async () => {
    globalThis.fetch = mockFull([
      {
        id: 'n1',
        body: 'CHECKED IN CASH',
        source: 'MANAGER',
        authorName: 'ADMIN',
        createdAt: '2026-11-12T03:00:00.000Z',
        canDelete: true,
      },
    ]) as unknown as typeof fetch
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByLabelText('Notes for LIAM SMITH'))
    expect(await screen.findByText('CHECKED IN CASH')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('ADD A COMMENT'), { target: { value: 'CONFIRMED' } })
    fireEvent.click(screen.getByText('ADD'))

    await waitFor(() => {
      const post = methodCalls('POST').find((c) => String(c[0]).includes('/notes'))
      expect(post).toBeDefined()
      expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ body: 'CONFIRMED' })
    })
  })

  it('disables the notes icon before the row is saved', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('+ ADD PERSON'))
    const button = screen.getByLabelText('Notes for Staff 3') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('adds notes to the PDF link only when asked', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    const link = () => screen.getByText(/DOWNLOAD DISTRIBUTION PDF/).closest('a')
    expect(link()?.getAttribute('href')).toBe('/api/admin/tips/t1/pdf')

    fireEvent.click(screen.getByLabelText('Include notes in PDF'))
    await waitFor(() => expect(link()?.getAttribute('href')).toBe('/api/admin/tips/t1/pdf?notes=1'))
  })

  async function openImport(answer: string) {
    fireEvent.click(screen.getByText(/IMPORT HOURS/))
    fireEvent.click(await screen.findByText('NEXT'))
    fireEvent.change(screen.getByPlaceholderText('PASTE THE JSON ANSWER HERE...'), {
      target: { value: answer },
    })
    fireEvent.click(screen.getByText('PREVIEW'))
  }

  it('shows parsed hours in the import preview instead of NO PRICE', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    await openImport(
      JSON.stringify({
        staff: [
          { name: 'LIAM SMITH', hours: 705 },
          { name: 'SHAYLA JONES', hours: 634, weight: 0.75 },
        ],
      }),
    )

    expect(await screen.findByText('705 HRS')).toBeTruthy()
    expect(screen.getByText('634 HRS · W 0.75')).toBeTruthy()
    expect(screen.queryByText('NO PRICE')).toBeNull()
  })

  it('applies imported hours into the draft (matched row updated, unknown name manual)', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    await openImport(
      JSON.stringify({
        staff: [
          { name: 'LIAM SMITH', hours: 999 },
          { name: 'WALK IN WONDER', hours: 5 },
        ],
      }),
    )
    await screen.findByText('999 HRS')
    fireEvent.click(screen.getByText('IMPORT SELECTED'))

    await screen.findByText('IMPORT COMPLETE')
    expect((screen.getByLabelText('Staff 1 hours') as HTMLInputElement).value).toBe('999')
    expect((screen.getByLabelText('Staff 3 name') as HTMLInputElement).value).toBe('WALK IN WONDER')
  })
})
