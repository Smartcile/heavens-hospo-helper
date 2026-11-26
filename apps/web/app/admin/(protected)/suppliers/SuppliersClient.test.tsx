import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

import { SuppliersClient } from './SuppliersClient'

type FetchSpy = typeof fetch & { mock: { calls: unknown[][] } }

const SUPPLIERS = [
  {
    id: 's1',
    name: 'BIDFOOD',
    contact: 'JO',
    email: null,
    phone: null,
    notes: null,
    isActive: true,
    venueId: 'v1',
    dropOffGuide: { id: 'g1', title: 'BIDFOOD DROP-OFF', status: 'PUBLISHED', guideType: 'SUPPLIER_INFO' },
  },
  {
    id: 's2',
    name: 'NEW WORLD',
    contact: null,
    email: null,
    phone: null,
    notes: null,
    isActive: true,
    venueId: 'v1',
    dropOffGuide: { id: 'g2', title: 'NEW WORLD DROP-OFF', status: 'DRAFT', guideType: 'SUPPLIER_INFO' },
  },
  {
    id: 's3',
    name: 'NO GUIDE SUPPLIER',
    contact: null,
    email: null,
    phone: null,
    notes: null,
    isActive: true,
    venueId: 'v1',
    dropOffGuide: null,
  },
]

const OPTIONS = [
  { id: 'g1', title: 'BIDFOOD DROP-OFF', status: 'PUBLISHED' },
  { id: 'g2', title: 'NEW WORLD DROP-OFF', status: 'DRAFT' },
  { id: 'g3', title: 'TEMPLATE DROP-OFF', status: 'DRAFT' },
]

function mockFetch(suppliers = SUPPLIERS) {
  return vi.fn((url: string, init?: RequestInit) => {
    const json = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })
    const u = String(url)
    if (u === '/api/admin/suppliers/dropoff-guide-options') return json(OPTIONS)
    if (u === '/api/admin/suppliers' && !init?.method) return json(suppliers)
    if (u.startsWith('/api/admin/suppliers/') && init?.method === 'PUT') return json({ id: 's1' })
    return json([])
  }) as unknown as FetchSpy
}

describe('SuppliersClient drop-off guides', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('shows whether each supplier has drop-off info', async () => {
    globalThis.fetch = mockFetch()
    render(<SuppliersClient />)

    expect(await screen.findByText('DROP-OFF: BIDFOOD DROP-OFF')).toBeDefined()
    expect(screen.getAllByText('NO DROP-OFF GUIDE').length).toBeGreaterThan(0)
  })

  it('shows the assigned guide and assigns another one', async () => {
    const spy = mockFetch()
    globalThis.fetch = spy
    render(<SuppliersClient />)

    await screen.findByText('DROP-OFF: BIDFOOD DROP-OFF')
    fireEvent.click(screen.getByText('BIDFOOD'))

    expect(await screen.findByText('DROP-OFF GUIDE: BIDFOOD DROP-OFF · PUBLISHED')).toBeDefined()

    fireEvent.change(screen.getByLabelText('DROP-OFF GUIDE'), { target: { value: 'g3' } })
    fireEvent.click(screen.getByText('CHANGE'))

    await waitFor(() => {
      const put = spy.mock.calls.find(
        (c) => String(c[0]) === '/api/admin/suppliers/s1' && (c[1] as RequestInit | undefined)?.method === 'PUT',
      )
      expect(put).toBeTruthy()
      expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({ dropOffGuideId: 'g3' })
    })
  })

  it('warns that a draft guide is not visible to workers yet', async () => {
    globalThis.fetch = mockFetch()
    render(<SuppliersClient />)

    await screen.findByText('DROP-OFF: NEW WORLD DROP-OFF')
    fireEvent.click(screen.getByText('NEW WORLD'))

    expect(await screen.findByText('DROP-OFF GUIDE: NEW WORLD DROP-OFF · DRAFT')).toBeDefined()
    expect(screen.getByText('PUBLISH TO SHOW WORKERS')).toBeDefined()
  })

  it('clears the assigned guide', async () => {
    const spy = mockFetch()
    globalThis.fetch = spy
    render(<SuppliersClient />)

    await screen.findByText('DROP-OFF: BIDFOOD DROP-OFF')
    fireEvent.click(screen.getByText('BIDFOOD'))
    await screen.findByText('DROP-OFF GUIDE: BIDFOOD DROP-OFF · PUBLISHED')

    fireEvent.click(screen.getByText('CLEAR'))

    await waitFor(() => {
      const put = spy.mock.calls.find(
        (c) => String(c[0]) === '/api/admin/suppliers/s1' && (c[1] as RequestInit | undefined)?.method === 'PUT',
      )
      expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({ dropOffGuideId: null })
    })
  })
})
