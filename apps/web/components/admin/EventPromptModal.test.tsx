import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EventPromptModal, mergeParsedBlocks } from '@/components/admin/EventPromptModal'
import { BEO_BLOCKS } from '@/lib/beo-blocks'
import type { EventPromptEvent } from '@/lib/event-prompt'

const EVENT: EventPromptEvent = {
  name: 'SMITH WEDDING',
  eventType: 'WEDDING',
  status: 'TENTATIVE',
  eventDate: '2026-11-14',
  startTime: '16:00',
  endTime: '23:00',
  guestCount: 96,
  diningStyle: 'PLATED',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  depositAmount: 2500,
  notes: null,
}

const BLOCKS = [
  { id: 'b1', type: 'MENU_SELECTION', title: null, config: { items: [], notes: 'OLD' }, sortOrder: 0 },
]

const REFS = { menus: [], menuItems: [], services: [], setups: [] }

const ANSWER = JSON.stringify({
  event: { guestCount: 110, status: 'CONFIRMED' },
  blocks: [{ type: 'MENU_SELECTION', title: null, config: { items: [], notes: 'BUFFET' } }],
  awaiting: [{ label: 'DEPOSIT', since: '2026-11-01' }],
  reply: 'THANK YOU — UPDATED.',
})

function fenced(value: string): string {
  return `\`\`\`json\n${value}\n\`\`\``
}

function setup(onApply = vi.fn().mockResolvedValue(true)) {
  const onClose = vi.fn()
  render(
    <EventPromptModal
      isOpen
      onClose={onClose}
      event={EVENT}
      blocks={BLOCKS}
      refs={REFS}
      library={BEO_BLOCKS}
      onApply={onApply}
    />,
  )
  return { onApply, onClose }
}

function pasteAndPreview(answer: string) {
  fireEvent.change(screen.getByPlaceholderText('PASTE THE ```json BLOCK HERE'), { target: { value: answer } })
  fireEvent.click(screen.getByText('PREVIEW DIFF'))
}

describe('EventPromptModal', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('renders the mode picker, prompt and paste box', () => {
    setup()
    expect(screen.getByRole('combobox')).toBeTruthy()
    expect(screen.getByText('COPY PROMPT')).toBeTruthy()
    expect(screen.getByText(/VIEW PROMPT/)).toBeTruthy()
  })

  it('previews a diff and applies the patch + blocks + a summary without the pasted message', async () => {
    const { onApply } = setup()
    pasteAndPreview(fenced(ANSWER))

    expect(screen.getByText('GUEST COUNT')).toBeTruthy()
    expect(screen.getByText('110')).toBeTruthy()

    fireEvent.click(screen.getByText('APPLY'))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))

    const result = onApply.mock.calls[0][0] as { patch: Record<string, unknown>; blocks: unknown[]; summary: string }
    expect(result.patch).toEqual({ guestCount: 110, status: 'CONFIRMED' })
    expect(result.blocks.map((b) => (b as { type: string }).type)).toEqual(['MENU_SELECTION', 'AWAITING'])
    expect(result.summary).toBe('LLM_PASTE — 2 FIELD(S), 1 BLOCK(S)')
    expect(result.summary).not.toContain('THANK YOU')
  })

  it('keeps APPLY disabled and shows a readable reason for an invalid answer', () => {
    setup()
    pasteAndPreview('nothing useful here')
    expect(screen.getByText(/NO JSON BLOCK FOUND/)).toBeTruthy()
    expect((screen.getByText('APPLY') as HTMLButtonElement).disabled).toBe(true)
  })

  it('does nothing on CANCEL', () => {
    const { onApply, onClose } = setup()
    pasteAndPreview(fenced(ANSWER))
    fireEvent.click(screen.getByText('CANCEL'))
    expect(onApply).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('mergeParsedBlocks', () => {
  it('preserves an existing id by type and appends AWAITING', () => {
    const parsed = {
      patch: {},
      blocks: [{ type: 'MENU_SELECTION', title: null, config: {} }],
      awaiting: [{ label: 'DEPOSIT', since: null }],
      reply: null,
      issues: [],
    }
    const next = mergeParsedBlocks(BLOCKS, parsed)
    expect(next?.[0].id).toBe('b1')
    expect(next?.[1]).toMatchObject({ type: 'AWAITING', config: { rows: [{ label: 'DEPOSIT', since: '' }] } })
  })

  it('removes the AWAITING block when the answer clears the list', () => {
    const current = [
      ...BLOCKS,
      { id: 'b2', type: 'AWAITING', title: null, config: { rows: [{ label: 'DEPOSIT' }] }, sortOrder: 1 },
    ]
    const next = mergeParsedBlocks(current, {
      patch: {},
      blocks: null,
      awaiting: [],
      reply: null,
      issues: [],
    })
    expect(next?.map((b) => b.type)).toEqual(['MENU_SELECTION'])
  })

  it('leaves blocks untouched when the answer has neither blocks nor awaiting', () => {
    const next = mergeParsedBlocks(BLOCKS, {
      patch: { guestCount: 110 },
      blocks: null,
      awaiting: null,
      reply: 'OK',
      issues: [],
    })
    expect(next).toBeNull()
  })
})
