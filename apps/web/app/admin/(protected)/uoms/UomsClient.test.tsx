import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UomsClient } from './UomsClient'

const UOMS = [
  { id: 'u1', name: 'CUP', baseUnit: 'mL', conversionRatio: 250, kind: 'VOLUME', isBuiltIn: true, venueId: null },
  { id: 'u2', name: 'BUNCH', baseUnit: 'ea', conversionRatio: 1, kind: 'COUNT', isBuiltIn: true, venueId: null },
]

function mockFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/admin/uoms' && (!init || !init.method || init.method === 'GET')) {
      return Promise.resolve({ ok: true, json: async () => UOMS } as Response)
    }
    if (url === '/api/admin/uoms' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      return Promise.resolve({ ok: true, status: 201, json: async () => ({ ...body, id: 'u-new' }) } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
  })
}

describe('UomsClient — unit kinds', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists each unit with its dimension kind', async () => {
    render(<UomsClient />)
    await waitFor(() => expect(screen.getByText('CUP')).toBeTruthy())
    expect(screen.getByText('1 = 250 mL · VOLUME')).toBeTruthy()
    expect(screen.getByText('1 = 1 ea · COUNT')).toBeTruthy()
  })

  it('sends the chosen kind when creating a unit', async () => {
    render(<UomsClient />)
    await waitFor(() => expect(screen.getByRole('button', { name: '+ ADD' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '+ ADD' }))

    fireEvent.change(screen.getByPlaceholderText('e.g. 6 PACK 1L'), { target: { value: 'FL OZ' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. mL'), { target: { value: 'mL' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 6000'), { target: { value: '29.57' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'VOLUME' } })

    fireEvent.click(screen.getByRole('button', { name: 'CREATE' }))

    await waitFor(() => {
      const post = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === '/api/admin/uoms' && (c[1] as RequestInit)?.method === 'POST',
      )
      expect(post).toBeTruthy()
      const body = JSON.parse(String((post![1] as RequestInit).body))
      expect(body).toEqual(expect.objectContaining({ name: 'FL OZ', baseUnit: 'ml', conversionRatio: 29.57, kind: 'VOLUME' }))
    })
  })
})
