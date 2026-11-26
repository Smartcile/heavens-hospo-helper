import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EventBuilder, type EventDetail } from '@/components/admin/EventBuilder'

const pdfMocks = vi.hoisted(() => ({ PdfViewerModal: vi.fn() }))

vi.mock('@/components/ui/PdfViewerModal', () => ({
  PdfViewerModal: (props: Record<string, unknown>) => {
    pdfMocks.PdfViewerModal(props)
    return null
  },
}))

const EVENT: EventDetail = {
  id: 'e1',
  name: 'SMITH WEDDING',
  eventType: 'WEDDING',
  status: 'CONFIRMED',
  eventDate: '2026-11-14T00:00:00.000Z',
  startTime: '16:00',
  endTime: '23:00',
  guestCount: 96,
  diningStyle: 'PLATED',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  menuId: null,
  serviceId: null,
  setupId: null,
  pushToBookings: false,
  depositAmount: 2500,
  paymentStatus: 'PARTIAL',
  notes: null,
  internalNotes: null,
  blocks: [{ id: 'b1', type: 'NOTES', title: null, config: { text: 'HELLO' }, sortOrder: 0 }],
  history: [
    { at: '2026-11-25T01:02:00.000Z', type: 'CREATED', note: 'EVENT CREATED' },
    { at: '2026-11-25T02:03:00.000Z', type: 'LLM_PASTE', note: 'LLM_PASTE — 1 FIELD(S), 1 BLOCK(S)' },
  ],
}

const REFS = { menus: [], menuItems: [], services: [], setups: [] }

function renderBuilder() {
  return render(
    <EventBuilder event={EVENT} venueId="v1" refs={REFS} onBack={() => {}} onSaved={() => {}} />,
  )
}

describe('EventBuilder', () => {
  beforeEach(() => {
    pdfMocks.PdfViewerModal.mockReset()
    // The builder saves the event, then its blocks, then re-reads the event to
    // pick up real block ids — so the mock answers all three.
    globalThis.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(String(url).endsWith('/blocks') ? { saved: [], deleted: 0 } : EVENT),
      }),
    ) as unknown as typeof fetch
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the event name, date and its blocks', () => {
    renderBuilder()
    expect(screen.getByText('SMITH WEDDING')).toBeTruthy()
    expect(screen.getByText('2026-11-14')).toBeTruthy()
    expect(screen.getByText('1 BLOCK(S)')).toBeTruthy()
    // The NOTES block is on the canvas and also in the library.
    expect(screen.getAllByText(/NOTES/).length).toBeGreaterThan(0)
  })

  it('adds a block when a library tile is clicked', () => {
    renderBuilder()
    fireEvent.click(screen.getByText('MENU SELECTION'))
    expect(screen.getByText('2 BLOCK(S)')).toBeTruthy()
  })

  it('removes a block', () => {
    renderBuilder()
    fireEvent.click(screen.getByLabelText('Delete block'))
    expect(screen.getByText('0 BLOCK(S)')).toBeTruthy()
  })

  it('reorders a block with the down control', () => {
    renderBuilder()
    fireEvent.click(screen.getByText('MENU SELECTION'))
    // Blocks are [NOTES, MENU SELECTION]; move NOTES down.
    fireEvent.click(screen.getAllByLabelText('Move down')[0])
    const cards = screen.getAllByRole('button').map((b) => b.textContent ?? '')
    const notesIdx = cards.findIndex((t) => t.includes('NOTES') && !t.includes('MENU'))
    const menuIdx = cards.findIndex((t) => t.includes('MENU SELECTION'))
    expect(menuIdx).toBeGreaterThan(-1)
    expect(notesIdx).toBeGreaterThan(menuIdx)
  })

  it('saves the event then its blocks', async () => {
    renderBuilder()
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      expect(calls.length).toBeGreaterThanOrEqual(2)
      expect(calls[0][0]).toBe('/api/admin/events/e1')
      expect((calls[0][1] as { method: string }).method).toBe('PUT')
      expect(calls[1][0]).toBe('/api/admin/events/e1/blocks')
      expect((calls[1][1] as { method: string }).method).toBe('PUT')
    })
  })

  it('opens a BEO PDF variant in the in-app viewer', () => {
    renderBuilder()
    fireEvent.click(screen.getByText('FULL BEO'))

    const target = (pdfMocks.PdfViewerModal.mock.calls.at(-1)?.[0] as { target?: { url: string; downloadUrl: string } }).target
    expect(target).toMatchObject({
      url: '/api/admin/events/e1/pdf?variant=FULL&inline=1',
      downloadUrl: '/api/admin/events/e1/pdf?variant=FULL',
    })
  })

  it('shows the activity log including an LLM_PASTE entry', () => {
    renderBuilder()
    expect(screen.getByTestId('event-history')).toBeTruthy()
    expect(screen.getByText('LLM_PASTE — 1 FIELD(S), 1 BLOCK(S)')).toBeTruthy()
    expect(screen.getByText('CREATED')).toBeTruthy()
  })

  it('opens PROMPT and APPLY writes exactly the two existing PUTs with the diffed body', async () => {
    renderBuilder()
    fireEvent.click(screen.getByText('PROMPT'))
    expect(screen.getByTestId('event-prompt-modal')).toBeTruthy()

    const answer = JSON.stringify({
      event: { guestCount: 110 },
      blocks: [{ type: 'NOTES', title: null, config: { text: 'NEW' } }],
    })
    fireEvent.change(screen.getByPlaceholderText('PASTE THE ```json BLOCK HERE'), {
      target: { value: `\`\`\`json\n${answer}\n\`\`\`` },
    })
    fireEvent.click(screen.getByText('PREVIEW DIFF'))
    fireEvent.click(screen.getByText('APPLY'))

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: [string, { method?: string; body?: string }][] } }).mock.calls
      const puts = calls.filter(([, init]) => init?.method === 'PUT')
      expect(puts).toHaveLength(2)

      expect(puts[0][0]).toBe('/api/admin/events/e1')
      expect(JSON.parse(puts[0][1].body as string)).toMatchObject({ guestCount: 110 })

      expect(puts[1][0]).toBe('/api/admin/events/e1/blocks')
      const blocksBody = JSON.parse(puts[1][1].body as string)
      expect(blocksBody.blocks).toEqual([
        { id: 'b1', type: 'NOTES', title: null, config: { text: 'NEW' } },
      ])
      expect(blocksBody.historyNote).toBe('LLM_PASTE — 1 FIELD(S), 1 BLOCK(S)')
    })
  })

  it('CANCEL in the prompt modal writes nothing', () => {
    renderBuilder()
    fireEvent.click(screen.getByText('PROMPT'))
    fireEvent.change(screen.getByPlaceholderText('PASTE THE ```json BLOCK HERE'), {
      target: { value: '```json\n{ "event": { "guestCount": 110 } }\n```' },
    })
    fireEvent.click(screen.getByText('PREVIEW DIFF'))
    fireEvent.click(screen.getByText('CANCEL'))

    const calls = (globalThis.fetch as unknown as { mock: { calls: [string, { method?: string }][] } }).mock.calls
    expect(calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
  })
})
