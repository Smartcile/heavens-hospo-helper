import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieStore = new Map<string, string>()

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined,
    set: (name: string, value: string) => {
      cookieStore.set(name, value)
    },
  }),
}))

import {
  createKioskSession,
  generateKioskCode,
  getKioskSession,
  hashKioskCode,
  kioskCodeHint,
  setKioskCookie,
} from './parking-kiosk.server'
import { KIOSK_CODE_ALPHABET, KIOSK_COOKIE_NAME } from './parking-kiosk'

beforeEach(() => {
  cookieStore.clear()
})

describe('hashKioskCode', () => {
  it('is deterministic and case-insensitive', () => {
    expect(hashKioskCode('abc123')).toBe(hashKioskCode(' ABC-123 '))
    expect(hashKioskCode('abc123')).not.toBe(hashKioskCode('abc124'))
  })
})

describe('generateKioskCode', () => {
  it('uses the unambiguous alphabet at the requested length', () => {
    const code = generateKioskCode(10)
    expect(code).toHaveLength(10)
    for (const char of code) expect(KIOSK_CODE_ALPHABET).toContain(char)
  })

  it('never drops below the minimum length', () => {
    expect(generateKioskCode(2).length).toBeGreaterThanOrEqual(6)
  })

  it('hints the last two characters', () => {
    expect(kioskCodeHint('abcd12')).toBe('12')
  })
})

describe('kiosk session cookie', () => {
  it('round-trips the venue and code hash', async () => {
    const token = await createKioskSession({ venueId: 'v1', codeHash: 'hash' })
    setKioskCookie(token)
    expect(cookieStore.has(KIOSK_COOKIE_NAME)).toBe(true)
    expect(await getKioskSession()).toEqual({ venueId: 'v1', codeHash: 'hash' })
  })

  it('returns null for a missing or tampered token', async () => {
    expect(await getKioskSession()).toBeNull()
    cookieStore.set(KIOSK_COOKIE_NAME, 'not-a-jwt')
    expect(await getKioskSession()).toBeNull()
  })
})
