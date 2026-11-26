import { describe, it, expect } from 'vitest'
import { isHumanRoomName, roomNameFromFeed } from '@/lib/room-names'

describe('isHumanRoomName', () => {
  it('accepts short room codes', () => {
    expect(isHumanRoomName('MCK3')).toBe(true)
    expect(isHumanRoomName('ROOM1')).toBe(true)
    expect(isHumanRoomName('BAR')).toBe(true)
  })

  it('accepts names with spaces', () => {
    expect(isHumanRoomName('MCK 3')).toBe(true)
    expect(isHumanRoomName('TE KAWAU ROOM')).toBe(true)
  })

  it('accepts long word-like names with a small number suffix', () => {
    expect(isHumanRoomName('FUNCTIONROOM1')).toBe(true)
    expect(isHumanRoomName('CONFERENCEROOM')).toBe(true)
  })

  it('rejects Google calendar identifiers and emails', () => {
    expect(isHumanRoomName('hmsccomms@gmail.com')).toBe(false)
    expect(isHumanRoomName('c_1885a1b2c3d4e5f6@group.calendar.google.com')).toBe(false)
  })

  it('rejects hashes and base64 blobs', () => {
    expect(isHumanRoomName('3f9a2b7c8d1e4f5a6b7c8d9e0f1a2b3c')).toBe(false)
    expect(isHumanRoomName('aGVsbG8gd29ybGQgdGhpcyBpcyBhIHRlc3Q')).toBe(false)
  })

  it('rejects empty and whitespace-only names', () => {
    expect(isHumanRoomName('')).toBe(false)
    expect(isHumanRoomName('   ')).toBe(false)
  })
})

describe('roomNameFromFeed', () => {
  const url = 'https://calendar.google.com/calendar/ical/hmsccomms%40gmail.com/public/basic.ics'

  it('keeps a name a person typed', () => {
    expect(roomNameFromFeed('te kawau room', url)).toBe('TE KAWAU ROOM')
  })

  it('derives a readable name from the calendar id when the name is blank', () => {
    expect(roomNameFromFeed('', url)).toBe('HMSCCOMMS')
  })

  it('replaces an opaque identifier with the suggested name', () => {
    expect(roomNameFromFeed('3f9a2b7c8d1e4f5a6b7c8d9e0f1a2b3c', url)).toBe('HMSCCOMMS')
  })

  it('returns the typed name when no suggestion is available', () => {
    expect(roomNameFromFeed('THE HALL', 'https://example.com/feed.ics')).toBe('THE HALL')
    expect(roomNameFromFeed('', 'https://example.com/feed.ics')).toBe('')
  })
})
