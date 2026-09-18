// Pure shaping for the customer share page. Prisma-free so the public page and
// its tests share one definition of what a customer may see.
//
// Deliberately an explicit DENY list for blocks (STAFFING / NOTES / HISTORY are
// internal working notes) plus the Event's own `internalNotes`, which is never
// copied here. A new block type is customer-visible unless added to the list.

import type { EventPriceLine } from '@/lib/event-pricing'

export const INTERNAL_BLOCK_TYPES = ['STAFFING', 'NOTES', 'HISTORY']

export interface ShareBlockLike {
  id: string
  type: string
  title: string | null
  config: unknown
  sortOrder: number
}

export interface PublicEventBlock {
  id: string
  type: string
  title: string | null
  config: Record<string, unknown>
}

export interface PublicEventRequest {
  id: string
  kind: string
  status: string
  message: string
  responseNote: string | null
  createdAt: string
}

export interface PublicEventView {
  name: string
  eventType: string | null
  status: string
  eventDate: string
  startTime: string | null
  endTime: string | null
  guestCount: number
  diningStyle: string | null
  venueName: string
  contactName: string | null
  menuName: string | null
  setupName: string | null
  blocks: PublicEventBlock[]
  /** id → name lookup so the page can render block items as dish names. */
  menuItems: { id: string; name: string }[]
  totals: {
    subtotal: number
    deposit: number
    balance: number
    lines: EventPriceLine[]
  }
  approvedAt: string | null
  approvedByName: string | null
  requests: PublicEventRequest[]
}

export interface PublicEventInput {
  name: string
  eventType: string | null
  status: string
  eventDate: Date | string
  startTime: string | null
  endTime: string | null
  guestCount: number
  diningStyle: string | null
  contactName: string | null
  customerApprovedAt: Date | string | null
  customerApprovedByName: string | null
  blocks: ShareBlockLike[]
  venueName: string
  menuName: string | null
  setupName: string | null
  menuItems?: { id: string; name: string }[]
  totals: { subtotal: number; deposit: number; balance: number; lines: EventPriceLine[] }
  requests?: PublicEventRequest[]
}

function isoDate(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

function isoOrNull(value: Date | string | null): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.toISOString()
}

/** Whether a block is shown to the customer. */
export function isPublicBlock(type: string): boolean {
  return !INTERNAL_BLOCK_TYPES.includes(type)
}

/** Build the sanitised customer-facing view of an event. */
export function buildPublicEventView(input: PublicEventInput): PublicEventView {
  const blocks = [...(input.blocks ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((b) => isPublicBlock(b.type))
    .map((b) => ({
      id: b.id,
      type: b.type,
      title: b.title,
      config: b.config && typeof b.config === 'object' ? (b.config as Record<string, unknown>) : {},
    }))

  return {
    name: input.name,
    eventType: input.eventType,
    status: input.status,
    eventDate: isoDate(input.eventDate),
    startTime: input.startTime,
    endTime: input.endTime,
    guestCount: input.guestCount,
    diningStyle: input.diningStyle,
    venueName: input.venueName,
    contactName: input.contactName,
    menuName: input.menuName,
    setupName: input.setupName,
    blocks,
    menuItems: input.menuItems ?? [],
    totals: input.totals,
    approvedAt: isoOrNull(input.customerApprovedAt),
    approvedByName: input.customerApprovedByName,
    requests: (input.requests ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      message: r.message,
      responseNote: r.responseNote,
      createdAt: r.createdAt,
    })),
  }
}
