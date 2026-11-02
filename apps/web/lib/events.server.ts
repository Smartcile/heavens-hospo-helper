// Server-only event/BEO data access. Kept out of `lib/beo-blocks.ts` so the
// client builder never pulls Prisma (and the `pg` driver) into the browser
// bundle — the same split as `lib/guide-links.ts` / `guide-links.server.ts`.

import { prisma, Prisma } from '@hospo-ops/db'
import { randomBytes } from 'node:crypto'
import { hashApiKey } from '@/lib/public-api'
import {
  BEO_BLOCKS,
  invalidBlockTypes,
  normaliseConfig,
  stripBoundFields,
  type BlockLibrary,
} from '@/lib/beo-blocks'
import { computeEventTotals, type EventBlockLike } from '@/lib/event-pricing'
// Type-only — keeps jspdf out of every route that imports this module.
import type { BeoPdfData } from '@/lib/beo-pdf'

/**
 * Opaque customer-share token. Only its sha256 is stored (hash with
 * `hashApiKey` from lib/public-api); the raw token lives in the shared URL.
 */
export function generateShareToken(): string {
  return randomBytes(24).toString('hex')
}

/** The include shape for a customer-share lookup (no internal-only columns). */
export const shareEventInclude = {
  venue: { select: { id: true, name: true } },
  menu: { select: { name: true } },
  setup: { select: { name: true } },
  customer: { select: { name: true } },
  blocks: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
  changeRequests: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.EventInclude

export type ShareEvent = Prisma.EventGetPayload<{ include: typeof shareEventInclude }>

/**
 * Resolve an event from a customer share token: enabled, not expired, not
 * deleted. Returns null for anything else (the caller 404s without saying why).
 */
export async function eventByShareToken(token: string): Promise<ShareEvent | null> {
  if (!token || token.length < 20) return null
  return prisma.event.findFirst({
    where: {
      shareTokenHash: hashApiKey(token),
      shareEnabled: true,
      deletedAt: null,
      OR: [{ shareExpiresAt: null }, { shareExpiresAt: { gt: new Date() } }],
    },
    include: shareEventInclude,
  })
}

export const EVENT_STATUS_VALUES = [
  'ENQUIRY',
  'DRAFT',
  'TENTATIVE',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const

export const PAYMENT_STATUS_VALUES = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'] as const

export const BEO_REQUEST_STATUS_VALUES = ['PENDING', 'ACCEPTED', 'DECLINED'] as const

/** Everything the admin/worker event detail needs in one round trip. */
export const eventInclude = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  menu: { select: { id: true, name: true } },
  service: { select: { id: true, name: true } },
  setup: { select: { id: true, name: true } },
  booking: { select: { id: true, date: true, startTime: true, partySize: true } },
  template: { select: { id: true, name: true } },
  blocks: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.EventInclude

export type EventWithBlocks = Prisma.EventGetPayload<{ include: typeof eventInclude }>

/** Append an entry to an event's append-only history log. */
export async function logEventEvent(eventId: string, type: string, note: string): Promise<void> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { history: true } })
  if (!event) return
  const history = Array.isArray(event.history) ? [...(event.history as unknown[])] : []
  history.push({ at: new Date().toISOString(), type, note })
  await prisma.event.update({
    where: { id: eventId },
    data: { history: history as Prisma.InputJsonValue },
  })
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}

function nullableStr(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/**
 * Map a request body onto the writable Event columns. Only keys actually
 * present are returned, so the same function serves POST (required fields added
 * by the caller) and PUT (partial). Returns an `error` for a bad enum/date.
 */
export function buildEventData(
  body: Record<string, unknown>,
): { data: Record<string, unknown>; error?: string } {
  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = str(body.name)
    if (!name) return { data, error: 'Name is required' }
    data.name = name.toUpperCase()
  }
  if (body.eventType !== undefined) data.eventType = nullableStr(body.eventType)
  if (body.diningStyle !== undefined) data.diningStyle = nullableStr(body.diningStyle)

  if (body.status !== undefined) {
    const status = str(body.status)
    if (!status || !(EVENT_STATUS_VALUES as readonly string[]).includes(status)) {
      return { data, error: `Invalid status: ${body.status}` }
    }
    data.status = status
  }
  if (body.paymentStatus !== undefined) {
    const ps = str(body.paymentStatus)
    if (!ps || !(PAYMENT_STATUS_VALUES as readonly string[]).includes(ps)) {
      return { data, error: `Invalid payment status: ${body.paymentStatus}` }
    }
    data.paymentStatus = ps
  }

  if (body.eventDate !== undefined) {
    const raw = String(body.eventDate)
    const date = new Date(`${raw}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return { data, error: `Invalid date: ${raw}` }
    data.eventDate = date
  }

  if (body.startTime !== undefined) data.startTime = nullableStr(body.startTime)
  if (body.endTime !== undefined) data.endTime = nullableStr(body.endTime)

  if (body.guestCount !== undefined) {
    const n = Number(body.guestCount)
    if (!Number.isFinite(n) || n < 0) return { data, error: 'Invalid guest count' }
    data.guestCount = Math.round(n)
  }
  if (body.depositAmount !== undefined) {
    if (body.depositAmount === null || body.depositAmount === '') {
      data.depositAmount = null
    } else {
      const n = Number(body.depositAmount)
      if (!Number.isFinite(n) || n < 0) return { data, error: 'Invalid deposit' }
      data.depositAmount = n
    }
  }

  if (body.customerId !== undefined) data.customerId = nullableStr(body.customerId)
  if (body.contactName !== undefined) data.contactName = nullableStr(body.contactName)
  if (body.contactEmail !== undefined) data.contactEmail = nullableStr(body.contactEmail)
  if (body.contactPhone !== undefined) data.contactPhone = nullableStr(body.contactPhone)
  if (body.menuId !== undefined) data.menuId = nullableStr(body.menuId)
  if (body.serviceId !== undefined) data.serviceId = nullableStr(body.serviceId)
  if (body.setupId !== undefined) data.setupId = nullableStr(body.setupId)
  if (body.notes !== undefined) data.notes = nullableStr(body.notes)
  if (body.internalNotes !== undefined) data.internalNotes = nullableStr(body.internalNotes)
  if (body.pushToBookings !== undefined) data.pushToBookings = !!body.pushToBookings

  return { data }
}

export interface EventBlockInput {
  id?: string | null
  type: string
  title?: string | null
  config?: unknown
}

/**
 * Replace an event's blocks wholesale, diffing by id: removed rows are
 * soft-deleted, existing rows updated, new rows created — all in one
 * transaction. Mirrors the floorplan element save, including returning a
 * `_clientId → id` map so the builder can swap its temp ids for real ones.
 */
export async function saveEventBlocks(
  eventId: string,
  incoming: EventBlockInput[],
  library: BlockLibrary = BEO_BLOCKS,
): Promise<{ saved: { id: string; _clientId: string }[]; deleted: number }> {
  const existing = await prisma.beoBlock.findMany({
    where: { eventId, deletedAt: null },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((b) => b.id))
  const saved: { id: string; _clientId: string }[] = []

  const kept = incoming
    .map((b) => b.id)
    .filter((id): id is string => !!id && existingIds.has(id))
  const removed = [...existingIds].filter((id) => !kept.includes(id))

  await prisma.$transaction(async (tx) => {
    if (removed.length > 0) {
      await tx.beoBlock.updateMany({
        where: { id: { in: removed } },
        data: { deletedAt: new Date() },
      })
    }

    for (let i = 0; i < incoming.length; i++) {
      const b = incoming[i]
      const title = str(b.title) ?? null
      const config = stripBoundFields(
        b.type,
        normaliseConfig(b.type, b.config, library),
        library,
      ) as Prisma.InputJsonValue

      if (b.id && existingIds.has(b.id)) {
        await tx.beoBlock.update({
          where: { id: b.id },
          data: { type: b.type, title, config, sortOrder: i, deletedAt: null },
        })
        saved.push({ id: b.id, _clientId: b.id })
      } else {
        const created = await tx.beoBlock.create({
          data: { eventId, type: b.type, title, config, sortOrder: i },
        })
        saved.push({ id: created.id, _clientId: b.id ?? created.id })
      }
    }
  })

  return { saved, deleted: removed.length }
}

/** Block types in an incoming payload that are not in the library. */
export function validateBlockPayload(
  incoming: EventBlockInput[],
  library: BlockLibrary = BEO_BLOCKS,
): string[] {
  return invalidBlockTypes(incoming, library)
}

interface TemplateBlock {
  type?: unknown
  title?: unknown
  config?: unknown
}

export interface CreateFromTemplateOverrides {
  name: string
  eventDate: Date
  eventType?: string | null
  guestCount?: number | null
  diningStyle?: string | null
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  /** Lifecycle the new event starts in. Defaults to DRAFT. */
  status?: (typeof EVENT_STATUS_VALUES)[number]
}

/**
 * Create an event from a template, copying its blocks. Returns null when the
 * template does not exist or is not visible to this venue (built-ins are
 * venueId null and visible everywhere).
 */
export async function createEventFromTemplate(
  templateId: string,
  venueId: string,
  overrides: CreateFromTemplateOverrides,
  library: BlockLibrary = BEO_BLOCKS,
): Promise<EventWithBlocks | null> {
  const tpl = await prisma.beoTemplate.findFirst({
    where: { id: templateId, deletedAt: null, OR: [{ venueId }, { venueId: null }] },
  })
  if (!tpl) return null

  const blocks = Array.isArray(tpl.blocks) ? (tpl.blocks as TemplateBlock[]) : []
  const validBlocks = blocks.filter(
    (b) => typeof b.type === 'string' && invalidBlockTypes([b], library).length === 0,
  )

  return prisma.event.create({
    data: {
      venueId,
      name: overrides.name.toUpperCase().trim(),
      eventDate: overrides.eventDate,
      eventType: overrides.eventType ?? tpl.category ?? null,
      guestCount: overrides.guestCount ?? tpl.defaultPax ?? 0,
      diningStyle: overrides.diningStyle ?? tpl.defaultStyle ?? null,
      menuId: tpl.defaultMenuId ?? null,
      serviceId: tpl.defaultServiceId ?? null,
      setupId: tpl.defaultSetupId ?? null,
      templateId: tpl.id,
      contactName: overrides.contactName ?? null,
      contactEmail: overrides.contactEmail ?? null,
      contactPhone: overrides.contactPhone ?? null,
      status: overrides.status ?? 'DRAFT',
      history: [
        {
          at: new Date().toISOString(),
          type: 'CREATED',
          note: `CREATED FROM TEMPLATE ${tpl.name}`,
        },
      ] as Prisma.InputJsonValue,
      blocks: {
        create: validBlocks.map((b, i) => {
          const type = String(b.type)
          return {
            type,
            title: typeof b.title === 'string' && b.title.trim() ? b.title.trim() : null,
            config: stripBoundFields(type, normaliseConfig(type, b.config, library), library) as Prisma.InputJsonValue,
            sortOrder: i,
          }
        }),
      },
    },
    include: eventInclude,
  })
}

/** Snapshot an event's blocks into template-shaped rows. */
export function blocksToTemplate(blocks: { type: string; title: string | null; config: unknown }[]) {
  return blocks.map((b) => ({ type: b.type, title: b.title, config: b.config }))
}

export interface TemplateFromEventMeta {
  name: string
  category?: string | null
  description?: string | null
}

/**
 * Save an existing event AS a reusable template: snapshots its blocks plus the
 * menu/service/layout/pax/style defaults. Returns null when the event is not in
 * this venue.
 */
export async function createTemplateFromEvent(
  eventId: string,
  venueId: string,
  meta: TemplateFromEventMeta,
) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, venueId, deletedAt: null },
    include: {
      blocks: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!event) return null

  return prisma.beoTemplate.create({
    data: {
      venueId,
      isBuiltIn: false,
      name: meta.name.toUpperCase().trim(),
      description: meta.description ?? event.notes ?? null,
      category: meta.category ?? event.eventType ?? null,
      defaultPax: event.guestCount || null,
      defaultStyle: event.diningStyle ?? null,
      defaultMenuId: event.menuId ?? null,
      defaultServiceId: event.serviceId ?? null,
      defaultSetupId: event.setupId ?? null,
      blocks: blocksToTemplate(event.blocks) as Prisma.InputJsonValue,
    },
  })
}

/**
 * Assemble everything the BEO PDF renderer needs. Returns null when the event
 * is not in this venue. Pricing uses live MenuItem prices.
 */
export async function buildBeoPdfData(eventId: string, venueId: string): Promise<BeoPdfData | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, venueId, deletedAt: null },
    include: {
      venue: { select: { name: true } },
      menu: { select: { name: true } },
      setup: { select: { name: true } },
      customer: { select: { name: true } },
      blocks: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!event) return null

  const menuItems = await prisma.menuItem.findMany({
    where: { venueId, deletedAt: null },
    select: { id: true, name: true, price: true },
  })
  const totals = computeEventTotals(
    event.blocks as unknown as EventBlockLike[],
    menuItems,
    event.depositAmount,
  )

  return {
    venueName: event.venue.name,
    eventName: event.name,
    eventType: event.eventType,
    status: event.status,
    eventDate: event.eventDate.toISOString().slice(0, 10),
    startTime: event.startTime,
    endTime: event.endTime,
    guestCount: event.guestCount,
    diningStyle: event.diningStyle,
    contactName: event.contactName ?? event.customer?.name ?? null,
    contactEmail: event.contactEmail,
    contactPhone: event.contactPhone,
    menuName: event.menu?.name ?? null,
    setupName: event.setup?.name ?? null,
    notes: event.notes,
    internalNotes: event.internalNotes,
    blocks: event.blocks.map((b) => ({
      type: b.type,
      title: b.title,
      config: (b.config && typeof b.config === 'object' ? b.config : {}) as Record<string, unknown>,
    })),
    menuItems: menuItems.map((m) => ({ id: m.id, name: m.name })),
    totals: {
      subtotal: totals.subtotal,
      deposit: totals.deposit,
      balance: totals.balance,
      lines: totals.lines.map((l) => ({ name: l.name, qty: l.qty, total: l.total })),
    },
  }
}
