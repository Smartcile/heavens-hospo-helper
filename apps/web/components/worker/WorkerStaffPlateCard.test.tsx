import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WorkerStaffPlateCard } from './WorkerStaffPlateCard'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

const ENABLED = {
  enabled: true,
  plates: [
    {
      id: 'p1',
      plate: 'OLD1',
      status: 'ACTIVE',
      enteredInSystem: false,
      createdAt: '2026-11-01T09:00:00.000Z',
    },
  ],
  requests: [
    {
      id: 'r1',
      plate: 'NEW99',
      previousPlate: 'OLD1',
      reason: 'new car',
      status: 'PENDING',
      reviewNote: null,
      createdAt: '2026-11-12T09:00:00.000Z',
    },
  ],
  settings: { name: 'STAFF CARPARK', notes: 'REAR GATE' },
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WorkerStaffPlateCard', () => {
  it('renders nothing when staff plates are off', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ enabled: false }))
    const { container } = render(<WorkerStaffPlateCard />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('shows the current plate, system state and pending request', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? jsonResponse({ request: { id: 'r2' } }) : jsonResponse(ENABLED),
    )
    render(<WorkerStaffPlateCard />)

    expect(await screen.findByText('OLD1')).toBeInTheDocument()
    expect(screen.getByText(/NOT IN THE SYSTEM YET/)).toBeInTheDocument()
    expect(screen.getByText(/WAITING FOR APPROVAL/)).toBeInTheDocument()
    expect(screen.getByText('REAR GATE')).toBeInTheDocument()
  })

  it('sends an add/change request with a required note', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? jsonResponse({ request: { id: 'r2' } }) : jsonResponse(ENABLED),
    )
    render(<WorkerStaffPlateCard />)
    await screen.findByText('OLD1')

    fireEvent.click(screen.getByRole('button', { name: '+ ADD ANOTHER PLATE' }))
    fireEvent.change(screen.getByPlaceholderText('ABC123'), {
      target: { value: 'new 99' },
    })
    fireEvent.change(screen.getByPlaceholderText(/WHY IS THIS CHANGING/i), {
      target: { value: 'second car' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'SEND FOR APPROVAL' }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'POST'),
      ).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'POST')
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toMatchObject({
      licensePlate: 'NEW99',
      reason: 'second car',
      replacePlateId: null,
    })
  })
})
