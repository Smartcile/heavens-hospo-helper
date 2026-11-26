import { describe, it, expect } from 'vitest'
import {
  awaitingFromBlocks,
  buildEventPrompt,
  diffEventPatch,
  EVENT_PROMPT_MODES,
  parseEventAnswer,
  type EventPromptEvent,
  type EventPromptRefs,
} from '@/lib/event-prompt'

const EVENT: EventPromptEvent = {
  name: 'SMITH WEDDING',
  eventType: 'WEDDING',
  status: 'TENTATIVE',
  eventDate: '2026-11-14',
  startTime: '16:00',
  endTime: '23:00',
  guestCount: 96,
  diningStyle: 'PLATED',
  contactName: 'JANE SMITH',
  contactEmail: 'jane@example.com',
  contactPhone: '021 000 000',
  depositAmount: 2500,
  notes: 'GARDEN CEREMONY',
  blocks: [
    {
      type: 'MENU_SELECTION',
      title: null,
      config: { items: [{ menuItemId: 'm1', qty: 96 }], notes: 'TWO VEGAN MAINS' },
    },
  ],
}

const REFS: EventPromptRefs = {
  venueName: 'AKARANA EATERY',
  menus: [{ id: 'men1', name: 'WEDDING MENU' }],
  menuItems: [{ id: 'm1', name: 'ROAST LAMB', price: 42.5 }],
  services: [{ id: 'sv1', name: 'DINNER' }],
  setups: [
    { id: 's1', name: 'WEDDING RECEPTION', roomName: 'THE BARN', guestCapacity: 120, setupStyle: 'PLATED' },
  ],
}

function fenced(value: unknown): string {
  return `Here is the answer:\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\nThanks.`
}

const VALID_ANSWER = {
  event: { guestCount: 110, diningStyle: 'BUFFET', status: 'CONFIRMED' },
  blocks: [
    { type: 'MENU_SELECTION', title: null, config: { items: [{ menuItemId: 'm1', qty: 110 }], notes: 'BUFFET' } },
    { type: 'AWAITING', title: null, config: { rows: [{ label: 'DEPOSIT', since: '2026-11-01' }] } },
  ],
  awaiting: [{ label: 'FINAL NUMBERS', since: '2026-11-20' }],
  reply: 'THANK YOU — UPDATED TO 110 GUESTS.',
}

describe('buildEventPrompt', () => {
  it('carries every field the parser reads, for every mode', () => {
    for (const mode of EVENT_PROMPT_MODES) {
      const prompt = buildEventPrompt(EVENT, REFS, { mode, customerMessage: 'CAN WE MOVE TO 110?' })
      expect(prompt).toContain('CURRENT EVENT')
      expect(prompt).toContain('SMITH WEDDING')
      expect(prompt).toContain('GUESTS: 96')
      expect(prompt).toContain('2026-11-14')
      expect(prompt).toContain('CURRENT BLOCKS')
      expect(prompt).toContain('MENU_SELECTION')
      expect(prompt).toContain('AWAITING')
      expect(prompt).toContain('MENU ITEMS AND LIVE RATES')
      expect(prompt).toContain('ROAST LAMB: $42.50')
      expect(prompt).toContain('THE BARN')
      expect(prompt).toContain('CAN WE MOVE TO 110?')
      expect(prompt).toContain('"event"')
      expect(prompt).toContain('"blocks"')
      expect(prompt).toContain('"awaiting"')
      expect(prompt).toContain('"reply"')
      // The exact keys the parser accepts are documented.
      expect(prompt).toContain('guestCount')
      expect(prompt).toContain('depositAmount')
      expect(prompt).toContain('contactEmail')
    }
  })

  it('changes the mode instruction', () => {
    const reply = buildEventPrompt(EVENT, REFS, { mode: 'REPLY' })
    const extract = buildEventPrompt(EVENT, REFS, { mode: 'EXTRACT' })
    expect(reply).toContain('MODE REPLY')
    expect(extract).toContain('MODE EXTRACT')
    expect(reply).not.toContain('MODE EXTRACT')
  })

  it('works with no refs and no customer message', () => {
    const prompt = buildEventPrompt({ name: 'BARE EVENT', eventDate: '2026-01-01' }, {}, { mode: 'BEO' })
    expect(prompt).toContain('BARE EVENT')
    expect(prompt).toContain('PASTE THE CUSTOMER MESSAGE HERE')
  })
})

describe('parseEventAnswer', () => {
  it('parses a fenced valid answer into a patch, blocks, awaiting and a reply', () => {
    const result = parseEventAnswer(fenced(VALID_ANSWER))
    expect(result.issues).toEqual([])
    expect(result.patch).toEqual({ guestCount: 110, diningStyle: 'BUFFET', status: 'CONFIRMED' })
    expect(result.blocks).toHaveLength(2)
    expect(result.awaiting).toEqual([{ label: 'FINAL NUMBERS', since: '2026-11-20' }])
    expect(result.reply).toBe('THANK YOU — UPDATED TO 110 GUESTS.')
  })

  it('parses prose-wrapped JSON (no fenced marker)', () => {
    const raw = `Sure! Here it is.\n${JSON.stringify(VALID_ANSWER)}\nHope that helps.`
    const result = parseEventAnswer(raw)
    expect(result.issues).toEqual([])
    expect(result.patch.guestCount).toBe(110)
  })

  it('never throws on invalid JSON and reports a readable reason', () => {
    const result = parseEventAnswer('```json\n{ "event": { "guestCount": } }\n```')
    expect(result.patch).toEqual({})
    expect(result.blocks).toBeNull()
    expect(result.issues[0]).toMatchObject({ code: 'INVALID_JSON', severity: 'ERROR' })
    expect(result.issues[0].message).toMatch(/COULD NOT BE PARSED/)
  })

  it('reports a missing JSON block', () => {
    const result = parseEventAnswer('The model refused to answer.')
    expect(result.issues[0]).toMatchObject({ code: 'NO_JSON', severity: 'ERROR' })
  })

  it('tolerates an answer that omits event and blocks', () => {
    const result = parseEventAnswer(fenced({ reply: 'NOTED.', awaiting: ['DEPOSIT'] }))
    expect(result.issues).toEqual([])
    expect(result.patch).toEqual({})
    expect(result.blocks).toBeNull()
    expect(result.awaiting).toEqual([{ label: 'DEPOSIT', since: null }])
    expect(result.reply).toBe('NOTED.')
  })

  it('rejects an unknown block type rather than dropping it silently', () => {
    const result = parseEventAnswer(
      fenced({ blocks: [{ type: 'MENU_SELECTION', config: {} }, { type: 'BAR_TAB', config: { limit: 1 } }] }),
    )
    expect(result.blocks?.map((b) => b.type)).toEqual(['MENU_SELECTION'])
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'UNKNOWN_BLOCK_TYPE', severity: 'ERROR', field: 'BAR_TAB' }),
    )
  })

  it('strips bound Event-column keys from a parsed block config', () => {
    const result = parseEventAnswer(
      fenced({
        blocks: [
          {
            type: 'CUSTOMER_DETAILS',
            config: { contactEmail: 'evil@example.com', billingNotes: 'KEEP ME' },
          },
        ],
      }),
    )
    expect(result.blocks?.[0].config).toEqual({ billingNotes: 'KEEP ME' })
  })

  it('strips reserved __state keys from a parsed block config', () => {
    const result = parseEventAnswer(
      fenced({ blocks: [{ type: 'NOTES', config: { text: 'X', __state: 'CONFIRMED' } }] }),
    )
    expect(result.blocks?.[0].config).toEqual({ text: 'X' })
  })

  it('normalises awaiting strings and objects', () => {
    const result = parseEventAnswer(
      fenced({ awaiting: ['MENU CHOICE', { label: 'FINAL NUMBERS', date: '2026-11-20' }, { label: '  ' }] }),
    )
    expect(result.awaiting).toEqual([
      { label: 'MENU CHOICE', since: null },
      { label: 'FINAL NUMBERS', since: '2026-11-20' },
    ])
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'AWAITING_BLANK' }))
  })

  it('keeps a valid date and rejects a bad one', () => {
    const result = parseEventAnswer(fenced({ event: { eventDate: '14/11/2026', name: 'NEW NAME' } }))
    expect(result.patch.name).toBe('NEW NAME')
    expect(result.patch.eventDate).toBeUndefined()
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'BAD_DATE' }))
  })
})

describe('diffEventPatch', () => {
  it('returns changed fields only, old → new', () => {
    const diffs = diffEventPatch(
      { guestCount: 96, diningStyle: 'PLATED', name: 'SMITH WEDDING' },
      { guestCount: 110, diningStyle: 'PLATED', name: 'SMITH WEDDING' },
    )
    expect(diffs).toEqual([
      { kind: 'FIELD', key: 'guestCount', label: 'GUEST COUNT', oldValue: '96', newValue: '110' },
    ])
  })

  it('diffs blocks by position and reports removal', () => {
    const current = [{ type: 'NOTES', title: null, config: { text: 'OLD' } }]
    const next = [
      { type: 'NOTES', title: null, config: { text: 'NEW' } },
      { type: 'TIMELINE', title: null, config: { rows: [] } },
    ]
    const diffs = diffEventPatch({}, {}, current, next)
    expect(diffs).toHaveLength(2)
    expect(diffs[0]).toMatchObject({ kind: 'BLOCK', key: '0' })
    expect(diffs[1]).toMatchObject({ kind: 'BLOCK', key: '1', oldValue: '—' })
  })
})

describe('awaitingFromBlocks', () => {
  it('reads the AWAITING block rows', () => {
    expect(
      awaitingFromBlocks([
        { type: 'NOTES', config: {} },
        { type: 'AWAITING', config: { rows: [{ label: 'DEPOSIT', since: '2026-11-01' }, { label: ' ' }] } },
      ]),
    ).toEqual([{ label: 'DEPOSIT', since: '2026-11-01' }])
  })

  it('returns [] when there is no AWAITING block', () => {
    expect(awaitingFromBlocks([{ type: 'NOTES', config: {} }])).toEqual([])
  })
})
