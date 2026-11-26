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
  venue: { name: 'AKARANA EATERY' },
}

const REFS = { menus: [], menuItems: [], services: [], setups: [] }

const PRICED_EVENT: EventDetail = {
  ...EVENT,
  guestCount: 96,
  depositAmount: 2500,
  blocks: [
    {
      id: 'b1',
      type: 'MENU_SELECTION',
      title: null,
      config: { items: [{ menuItemId: 'set', qty: 1, unit: 'PER_PERSON' }] },
      sortOrder: 0,
    },
  ],
}

const PRICED_REFS = {
  menus: [],
  menuItems: [
    { id: 'set', name: '3 COURSE SET', price: 85, pricingMode: 'PER_PERSON' },
    { id: 'can', name: 'CANAPE', price: 4, minQty: 20 },
  ],
  services: [],
  setups: [],
}

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

  it('persists the selected room in the save body', async () => {
    render(
      <EventBuilder
        event={{ ...EVENT, areaId: 'a1' }}
        venueId="v1"
        refs={{ ...REFS, areas: [{ id: 'a1', name: 'FUNCTION ROOM' }] }}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('SAVE'))
    await waitFor(() => {
      const puts = (globalThis.fetch as unknown as { mock: { calls: [string, { method?: string; body?: string }][] } }).mock.calls
        .filter(([, init]) => init?.method === 'PUT')
      expect(JSON.parse(puts[0][1].body as string)).toMatchObject({ areaId: 'a1' })
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

  it('opens PROMPT with the real venue name and APPLY writes exactly the two existing PUTs with the diffed body', async () => {
    renderBuilder()
    fireEvent.click(screen.getByText('PROMPT'))
    expect(screen.getByTestId('event-prompt-modal')).toBeTruthy()
    expect(screen.getByText(/AKARANA EATERY/)).toBeTruthy()

    const MESSAGE = 'SECRET CUSTOMER EMAIL BODY 98765'
    fireEvent.change(screen.getByPlaceholderText("PASTE THE CUSTOMER'S EMAIL OR MESSAGE HERE"), {
      target: { value: MESSAGE },
    })

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
      // Privacy contract: the pasted customer message is never in history.
      expect(blocksBody.historyNote).not.toContain(MESSAGE)
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

describe('EventBuilder — per-person pricing (#192)', () => {
  beforeEach(() => {
    pdfMocks.PdfViewerModal.mockReset()
    globalThis.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(String(url).endsWith('/blocks') ? { saved: [], deleted: 0 } : PRICED_EVENT),
      }),
    ) as unknown as typeof fetch
  })
  afterEach(() => { vi.restoreAllMocks() })

  function renderPriced() {
    return render(
      <EventBuilder event={PRICED_EVENT} venueId="v1" refs={PRICED_REFS} onBack={() => {}} onSaved={() => {}} />,
    )
  }

  it('prices a PER_PERSON line at pax x per-head and re-prices when the guest count changes', () => {
    renderPriced()
    // 96 guests x $85 = $8,160.00 (also shown in the PER PERSON group).
    expect(screen.getAllByText('$8160.00').length).toBeGreaterThan(0)
    expect(screen.getByText('$5660.00')).toBeTruthy()

    fireEvent.change(screen.getByTestId('event-guests'), { target: { value: '50' } })
    // 50 x $85 = $4,250.00
    expect(screen.getAllByText('$4250.00').length).toBeGreaterThan(0)
    expect(screen.getByTestId('pricing-by-unit')).toBeTruthy()
  })

  it('USE PAX fills the line quantity with the guest count', () => {
    renderPriced()
    fireEvent.click(screen.getByRole('button', { name: '▸ MENU SELECTION' }))

    const qty = screen.getByLabelText('Quantity') as HTMLInputElement
    expect(qty.value).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'USE PAX' }))
    expect((screen.getByLabelText('Quantity') as HTMLInputElement).value).toBe('96')
  })

  it('disables USE PAX on a platter with no serves-min yield', () => {
    render(
      <EventBuilder
        event={{
          ...PRICED_EVENT,
          blocks: [
            {
              id: 'b1',
              type: 'MENU_SELECTION',
              title: null,
              config: { items: [{ menuItemId: 'pl', qty: 1, unit: 'PER_PLATTER' }] },
              sortOrder: 0,
            },
          ],
        }}
        venueId="v1"
        refs={{ ...PRICED_REFS, menuItems: [{ id: 'pl', name: 'PLATTER', price: 65 }] }}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '▸ MENU SELECTION' }))
    expect((screen.getByRole('button', { name: 'USE PAX' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('warns before save when a line is below its minimum', () => {
    render(
      <EventBuilder
        event={{
          ...PRICED_EVENT,
          blocks: [
            {
              id: 'b1',
              type: 'MENU_SELECTION',
              title: null,
              config: { items: [{ menuItemId: 'can', qty: 10, unit: 'EACH' }] },
              sortOrder: 0,
            },
          ],
        }}
        venueId="v1"
        refs={PRICED_REFS}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    )
    const violations = screen.getByTestId('pricing-violations')
    expect(violations.textContent).toMatch(/CANAPE: MINIMUM 20, ORDERED 10/)
  })

  const SET_MENU_REFS = {
    menus: [
      {
        id: 'setmenu',
        name: 'WEDDING SET MENU',
        pricingMode: 'PER_PERSON',
        pricePerPerson: 95,
        groups: [{ id: 'g-main', name: 'MAIN', sortOrder: 0, minSelect: 1, maxSelect: 1 }],
        items: [
          { id: 'l1', menuItemId: 'beef', name: 'BEEF', groupId: 'g-main', sortOrder: 0 },
          { id: 'l2', menuItemId: 'fish', name: 'FISH', groupId: 'g-main', sortOrder: 1 },
        ],
      },
    ],
    menuItems: [{ id: 'set', name: 'SET MENU', price: 80, pricingMode: 'PER_PERSON' }],
    services: [],
    setups: [],
  }

  it('prices the bound PER_PERSON menu per head with no block items', () => {
    render(
      <EventBuilder
        event={{ ...PRICED_EVENT, menuId: 'setmenu', guestCount: 96, depositAmount: 0, blocks: [] }}
        venueId="v1"
        refs={SET_MENU_REFS}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    )
    // 96 x $95 = $9,120.00 (subtotal, group and balance share the figure).
    expect(screen.getAllByText('$9120.00').length).toBeGreaterThan(0)
  })

  it('authors a set-menu pick at the block level and saves it (never a second set-menu line)', async () => {
    render(
      <EventBuilder
        event={{
          ...PRICED_EVENT,
          menuId: 'setmenu',
          guestCount: 96,
          blocks: [
            {
              id: 'b1',
              type: 'MENU_SELECTION',
              title: null,
              config: { items: [] },
              sortOrder: 0,
            },
          ],
        }}
        venueId="v1"
        refs={SET_MENU_REFS}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '▸ MENU SELECTION' }))
    expect(screen.getByText(/SET MENU PICKS/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'MAIN: BEEF' }))
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: [string, { body?: string }][] } }).mock.calls
      const blocksPut = calls.find(([url]) => String(url).endsWith('/blocks'))
      expect(blocksPut).toBeTruthy()
      const body = JSON.parse(blocksPut![1].body as string)
      expect(body.blocks[0].config.packageChoices).toEqual([
        { groupId: 'g-main', groupName: 'MAIN', choiceId: 'beef', choiceName: 'BEEF', priceDelta: 0 },
      ])
      // The picks are not duplicated onto a priced product line.
      expect(body.blocks[0].config.items).toEqual([])
    })
  })

  it('clears the picks when the menu is changed from the block MENU control', async () => {
    const refs = {
      ...SET_MENU_REFS,
      menus: [
        ...SET_MENU_REFS.menus,
        { id: 'other', name: 'A LA CARTE', pricingMode: null, pricePerPerson: null },
      ],
    }
    render(
      <EventBuilder
        event={{
          ...PRICED_EVENT,
          menuId: 'setmenu',
          guestCount: 10,
          depositAmount: 0,
          blocks: [
            {
              id: 'b1',
              type: 'MENU_SELECTION',
              title: null,
              config: {
                items: [],
                packageChoices: [
                  { groupId: 'g-main', groupName: 'MAIN', choiceId: 'beef', choiceName: 'BEEF', priceDelta: 8 },
                ],
              },
              sortOrder: 0,
            },
          ],
        }}
        venueId="v1"
        refs={refs}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    )

    // The stale pick starts on the package line, then is cleared with the menu.
    expect(screen.getAllByText('$1030.00').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '▸ MENU SELECTION' }))
    expect(screen.getByText(/SET MENU PICKS/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('MENU'), { target: { value: 'other' } })
    expect(screen.queryByText(/SET MENU PICKS/)).toBeNull()

    fireEvent.click(screen.getByText('SAVE'))
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: [string, { body?: string }][] } }).mock.calls
      const blocksPut = calls.find(([url]) => String(url).endsWith('/blocks'))
      expect(blocksPut).toBeTruthy()
      const body = JSON.parse(blocksPut![1].body as string)
      expect(body.blocks[0].config.packageChoices).toBeUndefined()
    })
  })

  it('shows the set-menu picks only in the block that binds the menu', () => {
    render(
      <EventBuilder
        event={{
          ...PRICED_EVENT,
          menuId: 'setmenu',
          guestCount: 10,
          blocks: [
            {
              id: 'b1',
              type: 'DRINKS_SELECTION',
              title: null,
              config: { packageName: '', items: [], notes: '' },
              sortOrder: 0,
            },
          ],
        }}
        venueId="v1"
        refs={SET_MENU_REFS}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '▸ DRINKS SELECTION' }))
    expect(screen.queryByText(/SET MENU PICKS/)).toBeNull()
  })

  it('shows the bound menu-line minimum over the product default', () => {
    const refs = {
      ...SET_MENU_REFS,
      menus: [
        {
          ...SET_MENU_REFS.menus[0],
          items: [
            { id: 'l3', menuItemId: 'can', name: 'CANAPE', groupId: null, sortOrder: 0, minQty: 20 },
          ],
        },
      ],
      menuItems: [{ id: 'can', name: 'CANAPE', price: 4, minQty: 5 }],
    }
    render(
      <EventBuilder
        event={{
          ...PRICED_EVENT,
          menuId: 'setmenu',
          blocks: [
            {
              id: 'b1',
              type: 'MENU_SELECTION',
              title: null,
              config: { items: [{ menuItemId: 'can', qty: 10, unit: 'EACH' }] },
              sortOrder: 0,
            },
          ],
        }}
        venueId="v1"
        refs={refs}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '▸ MENU SELECTION' }))
    expect(screen.getByText('MIN 20')).toBeTruthy()
    const violations = screen.getByTestId('pricing-violations')
    expect(violations.textContent).toMatch(/CANAPE: MINIMUM 20, ORDERED 10/)
  })

  it('reports a bound menu that is not in the refs instead of silently omitting it', () => {
    render(
      <EventBuilder
        event={{ ...PRICED_EVENT, menuId: 'gone-menu', blocks: [] }}
        venueId="v1"
        menuDataAvailable={true}
        refs={REFS}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    )
    const violations = screen.getByTestId('pricing-violations')
    expect(violations.textContent).toMatch(/MENU NO LONGER EXISTS/)
  })

  it('does not claim a purged menu while the menu list is unavailable', () => {
    render(
      <EventBuilder
        event={{ ...PRICED_EVENT, menuId: 'setmenu', blocks: [] }}
        venueId="v1"
        menuDataAvailable={false}
        refs={REFS}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    )
    const violations = screen.getByTestId('pricing-violations')
    expect(violations.textContent).toMatch(/MENU DETAILS UNAVAILABLE/)
    expect(violations.textContent).not.toMatch(/MENU NO LONGER EXISTS/)
  })

  it('clears the set-menu picks when the bound menu changes', async () => {
    render(
      <EventBuilder
        event={{
          ...PRICED_EVENT,
          menuId: 'setmenu',
          blocks: [
            {
              id: 'b1',
              type: 'MENU_SELECTION',
              title: null,
              config: {
                items: [],
                packageChoices: [
                  { groupId: 'g-main', groupName: 'MAIN', choiceId: 'beef', choiceName: 'BEEF', priceDelta: 0 },
                ],
              },
              sortOrder: 0,
            },
          ],
        }}
        venueId="v1"
        refs={SET_MENU_REFS}
        onBack={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.change(screen.getByText('Menu').parentElement?.querySelector('select') as HTMLSelectElement, {
      target: { value: '' },
    })
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: [string, { body?: string }][] } }).mock.calls
      const blocksPut = calls.find(([url]) => String(url).endsWith('/blocks'))
      expect(blocksPut).toBeTruthy()
      const body = JSON.parse(blocksPut![1].body as string)
      expect(body.blocks[0].config.packageChoices).toBeUndefined()
    })
  })
})
