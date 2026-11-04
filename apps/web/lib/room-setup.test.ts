import { describe, it, expect } from 'vitest'
import {
  roomSetupLabel,
  isRoomSetup,
  sanitiseImageUrls,
  normaliseRoomSetupInput,
} from './room-setup'

describe('roomSetupLabel', () => {
  it('renders room, pax and style in the requested shape', () => {
    expect(
      roomSetupLabel({ name: 'WEDDING A', roomName: 'Main Room', guestCapacity: 22, setupStyle: 'Sit Down' }),
    ).toBe('MAIN ROOM - 22PAX SIT DOWN')
  })

  it('omits missing parts', () => {
    expect(roomSetupLabel({ name: 'WEDDING A', roomName: 'Main Room' })).toBe('MAIN ROOM')
    expect(roomSetupLabel({ name: 'WEDDING A', guestCapacity: 22, setupStyle: 'buffet' })).toBe('WEDDING A - 22PAX BUFFET')
    expect(roomSetupLabel({ name: 'Wedding A' })).toBe('WEDDING A')
  })

  it('ignores zero or negative pax', () => {
    expect(roomSetupLabel({ name: 'ROOM', guestCapacity: 0, setupStyle: 'Sit Down' })).toBe('ROOM - SIT DOWN')
  })
})

describe('isRoomSetup', () => {
  it('is true when any presentation field is present', () => {
    expect(isRoomSetup({ name: 'X', roomName: 'BAR' })).toBe(true)
    expect(isRoomSetup({ name: 'X', guestCapacity: 12 })).toBe(true)
    expect(isRoomSetup({ name: 'X', setupStyle: 'COCKTAIL' })).toBe(true)
    expect(isRoomSetup({ name: 'X', imageUrls: ['/api/upload/a.jpg'] })).toBe(true)
  })

  it('is false for a plain layout', () => {
    expect(isRoomSetup({ name: 'DEFAULT', imageUrls: [] })).toBe(false)
  })
})

describe('sanitiseImageUrls', () => {
  it('keeps upload paths and http(s) URLs, drops unsafe values and duplicates', () => {
    expect(
      sanitiseImageUrls([
        '/api/upload/a.jpg',
        '/uploads/legacy.png',
        'https://example.com/b.jpg',
        'javascript:alert(1)',
        '/api/upload/a.jpg',
        42,
        null,
        '  ',
      ]),
    ).toEqual(['/api/upload/a.jpg', '/uploads/legacy.png', 'https://example.com/b.jpg'])
  })

  it('returns an empty list for non-arrays', () => {
    expect(sanitiseImageUrls('nope')).toEqual([])
    expect(sanitiseImageUrls(undefined)).toEqual([])
  })
})

describe('normaliseRoomSetupInput', () => {
  it('uppercases, rounds pax and sanitises photos', () => {
    expect(
      normaliseRoomSetupInput({
        roomName: '  function room ',
        guestCapacity: '22.6',
        setupStyle: ' sit down ',
        imageUrls: ['/api/upload/a.jpg', 'nope'],
      }),
    ).toEqual({
      roomName: 'FUNCTION ROOM',
      guestCapacity: 23,
      setupStyle: 'SIT DOWN',
      imageUrls: ['/api/upload/a.jpg'],
    })
  })

  it('nulls blank and invalid values', () => {
    expect(
      normaliseRoomSetupInput({ roomName: '', guestCapacity: 'abc', setupStyle: null, imageUrls: null }),
    ).toEqual({ roomName: null, guestCapacity: null, setupStyle: null, imageUrls: [] })
    expect(normaliseRoomSetupInput({ guestCapacity: -5 }).guestCapacity).toBeNull()
  })
})
