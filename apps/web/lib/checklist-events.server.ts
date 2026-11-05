// Server half of checklist event activation. The pure open rule lives in
// `checklist-activation.ts`; everything Prisma-related for the ChecklistEvent
// junction lives here so the admin and worker routes share one validation and
// one wholesale-replace implementation.

import { prisma } from '@hospo-ops/db'

export type ParsedEventIds =
  | { ok: true; ids: string[] }
  | { ok: false; error: string }

/**
 * Validate an `eventIds` payload. `undefined`/null is handled by the caller
 * ("leave links untouched"); an array is de-duplicated. An empty array clears
 * every link.
 */
export function parseEventIds(input: unknown): ParsedEventIds {
  if (input === undefined || input === null) return { ok: true, ids: [] }
  if (!Array.isArray(input)) return { ok: false, error: 'EVENT IDS MUST BE A LIST' }
  const ids: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string' || !raw.trim()) {
      return { ok: false, error: 'INVALID EVENT ID' }
    }
    const id = raw.trim()
    if (!ids.includes(id)) ids.push(id)
  }
  return { ok: true, ids }
}

/** Every id must be a non-deleted CalendarEvent in the given venue. */
export async function validateChecklistEventIds(
  venueId: string,
  ids: readonly string[],
): Promise<string | null> {
  if (ids.length === 0) return null
  const count = await prisma.calendarEvent.count({
    where: { id: { in: [...ids] }, venueId, deletedAt: null },
  })
  if (count !== ids.length) return 'ONE OR MORE EVENTS ARE NOT IN THIS VENUE'
  return null
}

/**
 * Replace a checklist's event links with exactly `eventIds`. Removed links are
 * soft-deleted; an already-soft-deleted link for a re-selected event is revived
 * (the composite unique key spans deleted rows). Nothing is hard-deleted.
 */
export async function syncChecklistEvents(
  checklistId: string,
  eventIds: readonly string[],
): Promise<void> {
  const ids = [...eventIds]
  await prisma.$transaction(async (tx) => {
    await tx.checklistEvent.updateMany({
      where: {
        checklistId,
        deletedAt: null,
        ...(ids.length ? { calendarEventId: { notIn: ids } } : {}),
      },
      data: { deletedAt: new Date() },
    })
    for (const calendarEventId of ids) {
      await tx.checklistEvent.upsert({
        where: { checklistId_calendarEventId: { checklistId, calendarEventId } },
        update: { deletedAt: null },
        create: { checklistId, calendarEventId },
      })
    }
  })
}
