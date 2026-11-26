// Room-name helpers — pure and client-safe (no Prisma).
//
// Feeds created from bulk calendar links used to be named after the opaque
// calendar identifier ("3f9a2b7c…", "hmsccomms@gmail.com"), and the boot area
// migration happily turned each one into a junk room. These helpers let the
// migration (and the UI) tell a human room name from an identifier.

import { suggestRoomName } from './calendar-feeds'

// Generous upper bound for a "short room code" — MCK3, ROOM1, BAR.
const SHORT_NAME_MAX = 12

// Words with an optional small number suffix: FUNCTIONROOM, TEKAWAUROOM1,
// BOARD-ROOM, WINE & DINE. A hash/base64 blob never matches this because its
// digits are spread through the token instead of trailing it.
const WORDLIKE = /^[A-Za-z][A-Za-z&'’. -]*\d{0,3}$/

/**
 * True when a feed/room name looks like something a person typed rather than a
 * calendar identifier. Deliberately conservative: an empty name is not human,
 * and a long no-space token is only accepted when it reads as a word.
 */
export function isHumanRoomName(raw: string): boolean {
  const name = String(raw ?? '').trim()
  if (!name) return false
  if (/\s/.test(name)) return true // words separated by spaces
  if (name.includes('@')) return false // calendar id / email address
  if (name.length <= SHORT_NAME_MAX) return true // short code: MCK3 / ROOM1
  return WORDLIKE.test(name)
}

/**
 * The name to pre-fill when attaching a calendar link. Keeps a name a person
 * already typed; otherwise derives a readable one from the calendar id in the
 * URL (see `suggestRoomName`).
 */
export function roomNameFromFeed(name: string, url: string): string {
  const current = String(name ?? '').trim()
  const suggested = suggestRoomName(url)
  if (suggested && !isHumanRoomName(current)) return suggested.toUpperCase()
  return current.toUpperCase()
}
