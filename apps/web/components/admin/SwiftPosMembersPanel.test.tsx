import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SwiftPosMembersPanel } from './SwiftPosMembersPanel'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

const group = {
  id: 'g1',
  venueId: 'v1',
  name: 'RAYC MEMBERS',
  slug: 'rayc-members',
  kind: 'MEMBER_DATABASE',
  description: null,
  colour: null,
  isActive: true,
  sortOrder: 0,
  areas: ['CUSTOMERS'],
  mapping: { typeActive: 3, statusActive: 1, typeRemoved: 9, statusRemoved: 0, exportEncoding: 'UTF8_BOM' },
  memberCount: 12,
  createdAt: '',
  updatedAt: '',
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/admin/swiftpos/members') && init?.method === 'PUT') {
      return jsonResponse({ group })
    }
    return jsonResponse({ groups: [group] })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SwiftPosMembersPanel', () => {
  it('loads databases and saves an edited mapping', async () => {
    const { container } = render(<SwiftPosMembersPanel venueId="v1" />)
    expect(await screen.findByText('RAYC MEMBERS')).toBeInTheDocument()

    const inputs = container.querySelectorAll('input[type="number"]')
    fireEvent.change(inputs[0], { target: { value: '4' } })
    fireEvent.click(screen.getByText('SAVE MAPPING'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/swiftpos/members',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const call = fetchMock.mock.calls.find(([url, init]) => url === '/api/admin/swiftpos/members' && init?.method === 'PUT')
    const body = JSON.parse(String(call?.[1]?.body))
    expect(body).toMatchObject({ groupId: 'g1', swiftPosTypeActive: 4 })
  })
})
