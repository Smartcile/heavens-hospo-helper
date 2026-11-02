// Server-only enquiry helpers. An enquiry IS an Event in the ENQUIRY status —
// the first-visit chat, built from the venue's master template. "Converting" it
// simply advances the status into the BEO lifecycle, so the blocks, share link,
// PDF and push machinery all carry over untouched.

import { prisma, Prisma } from '@hospo-ops/db'
import { createEventFromTemplate, eventInclude, logEventEvent, type EventWithBlocks } from '@/lib/events.server'
import type { BlockLibrary } from '@/lib/beo-blocks'

/** The venue's master template (enquiry intake form), or null. */
export async function loadMasterTemplate(venueId: string) {
  return prisma.beoTemplate.findFirst({
    where: { venueId, isMaster: true, deletedAt: null },
  })
}

export interface CreateEnquiryOverrides {
  name: string
  eventDate: Date
  eventType?: string | null
  guestCount?: number | null
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
}

/**
 * Create an enquiry. When the venue has a master template its blocks seed the
 * enquiry; otherwise a blank enquiry is created. Always status ENQUIRY.
 */
export async function createEnquiry(
  venueId: string,
  overrides: CreateEnquiryOverrides,
  library?: BlockLibrary,
): Promise<EventWithBlocks> {
  const master = await loadMasterTemplate(venueId)
  if (master) {
    const event = await createEventFromTemplate(
      master.id,
      venueId,
      { ...overrides, status: 'ENQUIRY' },
      library,
    )
    if (event) return event
  }

  return prisma.event.create({
    data: {
      venueId,
      name: overrides.name.toUpperCase().trim(),
      eventDate: overrides.eventDate,
      eventType: overrides.eventType ?? null,
      guestCount: overrides.guestCount ?? 0,
      contactName: overrides.contactName ?? null,
      contactEmail: overrides.contactEmail ?? null,
      contactPhone: overrides.contactPhone ?? null,
      status: 'ENQUIRY',
      history: [
        { at: new Date().toISOString(), type: 'CREATED', note: 'ENQUIRY CREATED' },
      ] as Prisma.InputJsonValue,
    },
    include: eventInclude,
  })
}

/** The statuses an enquiry may be converted into (the BEO lifecycle). */
export const BEO_STATUS_VALUES = ['DRAFT', 'TENTATIVE', 'CONFIRMED'] as const

/**
 * Convert an enquiry into a BEO by advancing its status. Only an ENQUIRY can be
 * converted, and only into a BEO status. Returns the updated event, or null when
 * it is missing / not an enquiry in this venue.
 */
export async function convertEnquiry(
  eventId: string,
  venueId: string | null,
  status: (typeof BEO_STATUS_VALUES)[number],
): Promise<EventWithBlocks | null> {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      status: 'ENQUIRY',
      deletedAt: null,
      ...(venueId ? { venueId } : {}),
    },
    select: { id: true, name: true },
  })
  if (!event) return null

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: { status },
    include: eventInclude,
  })
  await logEventEvent(eventId, 'STATUS', `CONVERTED FROM ENQUIRY TO BEO — ${status}`)
  return updated
}

/**
 * Make a venue template the enquiry master, demoting any incumbent in the same
 * transaction. Built-ins cannot be master. Returns null when not found.
 */
export async function setMasterTemplate(templateId: string, venueId: string) {
  const template = await prisma.beoTemplate.findFirst({
    where: { id: templateId, venueId, deletedAt: null },
    select: { id: true, isBuiltIn: true },
  })
  if (!template || template.isBuiltIn) return null

  await prisma.$transaction([
    prisma.beoTemplate.updateMany({
      where: { venueId, isMaster: true, id: { not: templateId } },
      data: { isMaster: false },
    }),
    prisma.beoTemplate.update({
      where: { id: templateId },
      data: { isMaster: true },
    }),
  ])
  return prisma.beoTemplate.findUnique({ where: { id: templateId } })
}
