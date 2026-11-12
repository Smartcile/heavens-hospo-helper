import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SectionsClient } from '@/components/admin/SectionsClient'

const SECTIONS = [
  {
    id: 's1',
    name: 'COFFEE',
    colour: '#4ADE80',
    departmentId: 'd1',
    isActive: true,
    department: { id: 'd1', name: 'FOH', colour: '#FACC15' },
  },
]

const DEPARTMENTS = [{ id: 'd1', name: 'FOH', venueId: 'v1' }]

function json(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response)
}

function setup({
  sections = SECTIONS,
  departments = DEPARTMENTS,
}: { sections?: typeof SECTIONS; departments?: typeof DEPARTMENTS } = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.startsWith('/api/admin/sections')) {
      const method = init?.method ?? 'GET'
      if (method !== 'GET') return json({})
      return json(sections)
    }
    if (u.startsWith('/api/admin/departments')) return json(departments)
    return json(null)
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

function calls(fetchMock: ReturnType<typeof setup>) {
  return (fetchMock as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls
}

describe('SectionsClient', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('groups sections by department and opens the NEW SECTION modal', async () => {
    setup()
    render(<SectionsClient role="ADMIN" venueId="v1" />)

    await screen.findByText('COFFEE')
    expect(screen.getByText('FOH')).toBeTruthy()

    fireEvent.click(screen.getByText('+ NEW SECTION'))

    // The modal title is exactly "NEW SECTION"; the button reads "+ NEW SECTION".
    expect(screen.getByText('NEW SECTION')).toBeTruthy()
    expect(screen.getByText('SAVE')).toBeTruthy()
  })

  it('POSTs a new section with its departmentId', async () => {
    const fetchMock = setup()
    render(<SectionsClient role="ADMIN" venueId="v1" />)
    await screen.findByText('COFFEE')

    fireEvent.click(screen.getByText('+ NEW SECTION'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'd1' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. COFFEE'), { target: { value: 'BAR' } })
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const post = calls(fetchMock).find(([, init]) => init?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(String(post![1]!.body))).toMatchObject({
        name: 'BAR',
        departmentId: 'd1',
      })
    })
  })

  it('PUTs on edit and DELETEs on delete', async () => {
    const fetchMock = setup()
    render(<SectionsClient role="ADMIN" venueId="v1" />)
    await screen.findByText('COFFEE')

    fireEvent.click(screen.getByText('EDIT'))
    expect(screen.getByText('EDIT SECTION')).toBeTruthy()
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const put = calls(fetchMock).find(
        ([u, init]) => init?.method === 'PUT' && String(u) === '/api/admin/sections/s1',
      )
      expect(put).toBeTruthy()
      expect(JSON.parse(String(put![1]!.body))).toMatchObject({ name: 'COFFEE', colour: '#4ADE80' })
    })

    fireEvent.click(screen.getByText('DELETE'))

    await waitFor(() => {
      const del = calls(fetchMock).find(
        ([u, init]) => init?.method === 'DELETE' && String(u) === '/api/admin/sections/s1',
      )
      expect(del).toBeTruthy()
    })
  })

  it('scopes both GETs to scopeVenueId and filters department options', async () => {
    const fetchMock = setup({
      departments: [
        { id: 'd1', name: 'FOH', venueId: 'v1' },
        { id: 'd2', name: 'OTHER DEPT', venueId: 'v2' },
      ],
    })
    render(<SectionsClient role="ADMIN" venueId="v1" scopeVenueId="v1" />)
    await screen.findByText('COFFEE')

    const urls = calls(fetchMock).map(([u]) => String(u))
    expect(urls).toContain('/api/admin/sections?venueId=v1')
    expect(urls).toContain('/api/admin/departments?venueId=v1')

    fireEvent.click(screen.getByText('+ NEW SECTION'))
    const optionNames = Array.from(screen.getByRole('combobox').querySelectorAll('option')).map(
      (o) => o.textContent,
    )
    expect(optionNames).toContain('FOH')
    expect(optionNames).not.toContain('OTHER DEPT')
  })

  it('leaves the GETs unscoped when no scopeVenueId is given', async () => {
    const fetchMock = setup()
    render(<SectionsClient role="ADMIN" venueId="v1" />)
    await screen.findByText('COFFEE')

    const urls = calls(fetchMock).map(([u]) => String(u))
    expect(urls).toContain('/api/admin/sections')
    expect(urls).toContain('/api/admin/departments')
  })
})
