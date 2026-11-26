// Copy-paste LLM loop for BEO drafting — pure and Prisma-free.
//
// The operator copies a prompt into whatever LLM they already use (no API keys,
// no model calls, no mailbox credentials), pastes the answer back, reviews a
// diff and only then applies it. The app never talks to a model itself.
//
// The answer contract is one fenced JSON block:
//   { event: {...}, blocks: [...], awaiting: [...], reply: "..." }
// `parseEventAnswer` reuses the same tolerant JSON extraction as every other
// importer (`extractJsonBlock` from lib/menu-import.ts) and never throws.

import { extractJsonBlock } from '@/lib/menu-import'
import {
  BEO_BLOCKS,
  BEO_BLOCK_TYPES,
  blockLabel,
  stripBoundFields,
  summariseBlock,
  type BeoBlockLike,
  type BlockLibrary,
} from '@/lib/beo-blocks'
import type { ImportIssue } from '@/lib/import/types'

export type EventPromptMode = 'REPLY' | 'BEO' | 'EXTRACT'

export const EVENT_PROMPT_MODES: EventPromptMode[] = ['REPLY', 'BEO', 'EXTRACT']

export const EVENT_STATUSES = [
  'ENQUIRY',
  'DRAFT',
  'TENTATIVE',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const

/** Event columns the answer may patch. Deliberately narrower than the row. */
export const PATCHABLE_EVENT_FIELDS = [
  'name',
  'eventType',
  'status',
  'eventDate',
  'startTime',
  'endTime',
  'guestCount',
  'diningStyle',
  'contactName',
  'contactEmail',
  'contactPhone',
  'depositAmount',
  'notes',
] as const

export type PatchableEventField = (typeof PATCHABLE_EVENT_FIELDS)[number]

/** Venue reference data the prompt carries so the model can price and name. */
export interface EventPromptRefs {
  venueName?: string
  menus?: { id: string; name: string }[]
  menuItems?: { id: string; name: string; price?: number }[]
  services?: { id: string; name: string }[]
  setups?: {
    id: string
    name: string
    roomName?: string | null
    guestCapacity?: number | null
    setupStyle?: string | null
  }[]
}

/** The subset of an Event (and its blocks) the prompt needs. */
export interface EventPromptEvent {
  name: string
  eventType?: string | null
  status?: string | null
  eventDate: string
  startTime?: string | null
  endTime?: string | null
  guestCount?: number | null
  diningStyle?: string | null
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  depositAmount?: number | null
  notes?: string | null
  blocks?: PromptBlock[]
}

export interface EventPromptOptions {
  mode: EventPromptMode
  /** The customer email/message, pasted by the operator. */
  customerMessage?: string
}

export interface PromptBlock {
  type: string
  title?: string | null
  config?: Record<string, unknown> | null
}

export interface AwaitingItem {
  label: string
  since: string | null
}

/** A patch on Event columns. Only present keys are applied. */
export type EventPromptPatch = Partial<Record<PatchableEventField, string | number | null>>

export interface ParsedEventAnswer {
  patch: EventPromptPatch
  /** null = the answer omitted `blocks` (leave the current blocks alone). */
  blocks: PromptBlock[] | null
  /** null = the answer omitted `awaiting`. */
  awaiting: AwaitingItem[] | null
  reply: string | null
  issues: ImportIssue[]
}

export interface EventPromptDiff {
  kind: 'FIELD' | 'BLOCK'
  key: string
  label: string
  oldValue: string
  newValue: string
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/** Render the current blocks as a compact list for the prompt. */
function describeBlocks(blocks: PromptBlock[] | undefined): string {
  if (!blocks || blocks.length === 0) return '  (NONE YET)'
  return blocks
    .map((b) => {
      const label = b.title?.trim() || blockLabel(b.type)
      const summary = summariseBlock({ type: b.type, config: b.config ?? {} } as BeoBlockLike)
      const config = JSON.stringify(b.config ?? {})
      return `  - ${b.type}${b.title?.trim() ? ` (${label})` : ''}: ${summary} | CONFIG ${config}`
    })
    .join('\n')
}

/**
 * Build the copy-paste prompt for one event. Carries the venue, its rooms and
 * menu rates, the current blocks, the pasted customer message, the rules and a
 * strict output contract. Pure and deterministic.
 */
export function buildEventPrompt(
  event: EventPromptEvent,
  refs: EventPromptRefs = {},
  { mode, customerMessage }: EventPromptOptions = { mode: 'BEO' },
): string {
  const venue = refs.venueName?.trim() || 'THE VENUE'

  const roomLines =
    refs.setups && refs.setups.length > 0
      ? refs.setups
          .map((s) => {
            const name = [s.roomName?.trim(), s.name?.trim()].filter(Boolean).join(' — ')
            const pax = s.guestCapacity ? `${s.guestCapacity} PAX` : 'PAX NOT SET'
            const style = s.setupStyle?.trim() ? ` · ${s.setupStyle.trim().toUpperCase()}` : ''
            return `  - ${name || s.id}: ${pax}${style}`
          })
          .join('\n')
      : '  (NONE SET UP)'

  const menuLines =
    refs.menuItems && refs.menuItems.length > 0
      ? refs.menuItems
          .map((m) => `  - ${m.name}: ${m.price != null ? `$${Number(m.price).toFixed(2)}` : 'PRICE NOT SET'}`)
          .join('\n')
      : '  (NONE)'

  const menuNames =
    refs.menus && refs.menus.length > 0 ? refs.menus.map((m) => `  - ${m.name}`).join('\n') : '  (NONE)'

  const message = customerMessage?.trim()

  const modeRule =
    mode === 'REPLY'
      ? 'MODE REPLY: draft the customer-facing reply in "reply". Keep it warm, concise and factual. Only revise blocks/fields the message actually justifies.'
      : mode === 'EXTRACT'
        ? 'MODE EXTRACT: only copy facts that are explicitly present in the customer message. Do not invent, price or guess. Leave every unknown field out and keep the existing blocks unless the message changes them.'
        : 'MODE BEO: complete the banquet event order blocks from the message and the current event. Keep the existing authored content unless the message corrects it.'

  return [
    `You are drafting a banquet event order (BEO) for ${venue}.`,
    `Return STRICT JSON inside one fenced \`\`\`json block and nothing outside it.`,
    ``,
    `CURRENT EVENT`,
    `  NAME: ${display(event.name)}`,
    `  TYPE: ${display(event.eventType)}`,
    `  STATUS: ${display(event.status ?? 'DRAFT')} (one of ${EVENT_STATUSES.join(' | ')})`,
    `  DATE: ${display(event.eventDate)} (YYYY-MM-DD)`,
    `  START: ${display(event.startTime)}  END: ${display(event.endTime)} (24-hour HH:mm)`,
    `  GUESTS: ${display(event.guestCount)}`,
    `  DINING STYLE: ${display(event.diningStyle)}`,
    `  CONTACT: ${display(event.contactName)} · ${display(event.contactEmail)} · ${display(event.contactPhone)}`,
    `  DEPOSIT: ${display(event.depositAmount)}`,
    `  NOTES: ${display(event.notes)}`,
    ``,
    `ROOMS / SPACES (name — capacity / style)`,
    roomLines,
    ``,
    `MENUS`,
    menuNames,
    ``,
    `MENU ITEMS AND LIVE RATES (NZD, GST inclusive)`,
    menuLines,
    ``,
    `CURRENT BLOCKS (type: summary | raw config)`,
    describeBlocks(event.blocks),
    ``,
    `CUSTOMER MESSAGE (verbatim — never copy it into the answer's notes)`,
    message ? `"""\n${message}\n"""` : '(PASTE THE CUSTOMER MESSAGE HERE BEFORE COPYING THE PROMPT)',
    ``,
    `RULES`,
    `- ${modeRule}`,
    `- "blocks" is the COMPLETE revised block list, in order. Omit a block to remove it.`,
    `- Only these block types are valid: ${BEO_BLOCK_TYPES.join(', ')}. Any other type is ignored.`,
    `- A block is { "type": "TYPE", "title": null or "TITLE", "config": { ... } }.`,
    `- Bound event columns (contactName, contactEmail, contactPhone, diningStyle, menuId, setupId, depositAmount) belong in "event", never in a block config.`,
    `- Never include a "__state" key. Block state (TODO | SENT | CONFIRMED) is set in the app.`,
    `- "awaiting" lists what the customer still owes as short labels, e.g. [{"label":"FINAL NUMBERS","since":"2026-11-20"}]. Use [] when nothing is outstanding.`,
    `- "event" only carries fields you are changing: ${PATCHABLE_EVENT_FIELDS.join(', ')}. Omit unknown or unchanged fields.`,
    `- Never invent a price, date, guest count, menu item or room that is not in this prompt.`,
    `- Name the event, menus, rooms and blocks UPPERCASE, matching the venue's style.`,
    `- "reply" is a customer-facing message; leave it null when no reply is needed.`,
    `- If you cannot produce JSON, answer in Markdown using the same BEO headings (CUSTOMER DETAILS, DINING STYLE, MENU SELECTION, DRINKS SELECTION, DIETARY, ROOM SETUP, RUN SHEET, STAFFING, PAYMENT, AWAITING) — the app prefers the JSON block.`,
    ``,
    `JSON SHAPE`,
    `{`,
    `  "event": { "guestCount": 96, "diningStyle": "PLATED" },`,
    `  "blocks": [`,
    `    { "type": "MENU_SELECTION", "title": null, "config": { "items": [], "notes": "TWO VEGAN MAINS" } }`,
    `  ],`,
    `  "awaiting": [ { "label": "FINAL NUMBERS", "since": "2026-11-20" } ],`,
    `  "reply": "THANK YOU — WE HAVE NOTED THE VEGAN MAINS."`,
    `}`,
  ].join('\n')
}

/** Normalise an awaiting item from a string or object form. */
function normaliseAwaiting(raw: unknown): AwaitingItem | null {
  if (typeof raw === 'string') {
    const label = raw.trim()
    return label ? { label, since: null } : null
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    const label = trimOrNull(o.label ?? o.what ?? o.item ?? o.name)
    if (!label) return null
    const since = trimOrNull(o.since ?? o.date ?? o.at)
    return { label, since }
  }
  return null
}

/**
 * Extract the awaiting list from a set of blocks (the AWAITING block's rows).
 * Shared by the pipeline chips and the prompt diff.
 */
export function awaitingFromBlocks(blocks: PromptBlock[] | null | undefined): AwaitingItem[] {
  const block = (blocks ?? []).find((b) => b.type === 'AWAITING')
  const rows = block?.config?.rows
  if (!Array.isArray(rows)) return []
  return rows
    .map((raw) => {
      const row = asObject(raw)
      const label = trimOrNull(row.label)
      return label ? { label, since: trimOrNull(row.since) } : null
    })
    .filter((item): item is AwaitingItem => item !== null)
}

/**
 * Tolerant parse of a pasted LLM answer. Never throws: a bad answer returns
 * readable `ImportIssue`s and leaves the event untouched (the caller only
 * applies an explicit patch).
 */
export function parseEventAnswer(raw: string, library: BlockLibrary = BEO_BLOCKS): ParsedEventAnswer {
  const issues: ImportIssue[] = []
  const empty: ParsedEventAnswer = { patch: {}, blocks: null, awaiting: null, reply: null, issues }

  const jsonText = extractJsonBlock(raw ?? '')
  if (!jsonText) {
    issues.push({
      code: 'NO_JSON',
      severity: 'ERROR',
      message: 'NO JSON BLOCK FOUND — PASTE THE WHOLE ANSWER INCLUDING THE { } BLOCK.',
    })
    return empty
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    issues.push({
      code: 'INVALID_JSON',
      severity: 'ERROR',
      message: 'THE JSON BLOCK COULD NOT BE PARSED — ASK THE MODEL TO RETURN VALID JSON.',
    })
    return empty
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    issues.push({
      code: 'NOT_AN_OBJECT',
      severity: 'ERROR',
      message: 'THE ANSWER IS NOT A JSON OBJECT.',
    })
    return empty
  }

  const root = parsed as Record<string, unknown>
  if (!root.event && root.blocks === undefined && root.awaiting === undefined && root.reply === undefined) {
    issues.push({
      code: 'EMPTY_ANSWER',
      severity: 'ERROR',
      message: 'THE ANSWER HAS NO event, blocks, awaiting OR reply — NOTHING TO APPLY.',
    })
    return empty
  }

  const patch: EventPromptPatch = {}
  const eventRaw = root.event
  if (eventRaw !== undefined) {
    if (!eventRaw || typeof eventRaw !== 'object' || Array.isArray(eventRaw)) {
      issues.push({ code: 'EVENT_NOT_OBJECT', severity: 'WARNING', message: 'event WAS NOT AN OBJECT — IGNORED.' })
    } else {
      const e = eventRaw as Record<string, unknown>
      for (const field of PATCHABLE_EVENT_FIELDS) {
        if (!(field in e)) continue
        const value = e[field]
        if (value === null) {
          patch[field] = null
          continue
        }
        if (field === 'guestCount' || field === 'depositAmount') {
          const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''))
          if (!Number.isFinite(n)) {
            issues.push({ code: 'BAD_NUMBER', severity: 'WARNING', field, message: `${field} WAS NOT A NUMBER — IGNORED.` })
            continue
          }
          patch[field] = n
          continue
        }
        if (field === 'status') {
          const status = String(value).trim().toUpperCase()
          if (!(EVENT_STATUSES as readonly string[]).includes(status)) {
            issues.push({ code: 'BAD_STATUS', severity: 'WARNING', field, message: `UNKNOWN STATUS "${status}" — IGNORED.` })
            continue
          }
          patch[field] = status
          continue
        }
        if (field === 'eventDate') {
          const date = String(value).trim().slice(0, 10)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
            issues.push({ code: 'BAD_DATE', severity: 'WARNING', field, message: `eventDate "${date}" IS NOT YYYY-MM-DD — IGNORED.` })
            continue
          }
          patch[field] = date
          continue
        }
        if (typeof value === 'string') patch[field] = value.trim()
      }
    }
  }

  let blocks: PromptBlock[] | null = null
  if (root.blocks !== undefined) {
    if (!Array.isArray(root.blocks)) {
      issues.push({ code: 'BLOCKS_NOT_ARRAY', severity: 'ERROR', message: 'blocks WAS NOT AN ARRAY — BLOCKS LEFT UNCHANGED.' })
    } else {
      blocks = []
      for (const rawBlock of root.blocks) {
        const b = asObject(rawBlock)
        const type = String(b.type ?? '').trim().toUpperCase()
        if (!type) {
          issues.push({ code: 'BLOCK_NO_TYPE', severity: 'WARNING', message: 'A BLOCK HAD NO TYPE — SKIPPED.' })
          continue
        }
        if (!library.some((def) => def.type === type)) {
          issues.push({
            code: 'UNKNOWN_BLOCK_TYPE',
            severity: 'ERROR',
            field: type,
            message: `UNKNOWN BLOCK TYPE "${type}" — SKIPPED.`,
          })
          continue
        }
        const cfg = stripBoundFields(type, asObject(b.config))
        for (const key of Object.keys(cfg)) {
          if (key.startsWith('__')) delete cfg[key]
        }
        blocks.push({ type, title: trimOrNull(b.title), config: cfg })
      }
    }
  }

  let awaiting: AwaitingItem[] | null = null
  if (root.awaiting !== undefined) {
    if (!Array.isArray(root.awaiting)) {
      issues.push({ code: 'AWAITING_NOT_ARRAY', severity: 'WARNING', message: 'awaiting WAS NOT AN ARRAY — IGNORED.' })
    } else {
      awaiting = []
      for (const item of root.awaiting) {
        const normalised = normaliseAwaiting(item)
        if (!normalised) {
          issues.push({ code: 'AWAITING_BLANK', severity: 'WARNING', message: 'AN AWAITING ITEM HAD NO LABEL — SKIPPED.' })
          continue
        }
        awaiting.push(normalised)
      }
    }
  }

  const reply = trimOrNull(root.reply)

  if (issues.length === 0 && Object.keys(patch).length === 0 && blocks === null && awaiting === null) {
    issues.push({ code: 'NOTHING_TO_APPLY', severity: 'WARNING', message: 'THE ANSWER MADE NO CHANGES.' })
  }

  return { patch, blocks, awaiting, reply, issues }
}

function sameValue(a: unknown, b: unknown): boolean {
  const na = a === null || a === undefined || a === ''
  const nb = b === null || b === undefined || b === ''
  if (na && nb) return true
  return String(a) === String(b)
}

/**
 * Per-field and per-block old → new, so APPLY is a review step. Only changed
 * rows are returned. `nextBlocks === null` leaves blocks out of the diff.
 */
export function diffEventPatch(
  current: Record<string, unknown>,
  patch: EventPromptPatch,
  currentBlocks: PromptBlock[] = [],
  nextBlocks: PromptBlock[] | null = null,
): EventPromptDiff[] {
  const diffs: EventPromptDiff[] = []
  for (const field of PATCHABLE_EVENT_FIELDS) {
    if (!(field in patch)) continue
    const before = current[field]
    const after = patch[field]
    if (sameValue(before, after)) continue
    diffs.push({
      kind: 'FIELD',
      key: field,
      label: field.replace(/([A-Z])/g, ' $1').toUpperCase(),
      oldValue: display(before),
      newValue: display(after),
    })
  }

  if (nextBlocks) {
    const count = Math.max(currentBlocks.length, nextBlocks.length)
    for (let i = 0; i < count; i++) {
      const before = currentBlocks[i]
      const after = nextBlocks[i]
      const beforeText = before
        ? `${blockLabel(before.type)} · ${summariseBlock({ type: before.type, config: before.config ?? {} } as BeoBlockLike)}`
        : '—'
      const afterText = after
        ? `${blockLabel(after.type)} · ${summariseBlock({ type: after.type, config: after.config ?? {} } as BeoBlockLike)}`
        : '—'
      if (beforeText === afterText) continue
      diffs.push({
        kind: 'BLOCK',
        key: `${i}`,
        label: `BLOCK ${i + 1}`,
        oldValue: beforeText,
        newValue: afterText,
      })
    }
  }

  return diffs
}
