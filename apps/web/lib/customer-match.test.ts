import { describe, it, expect, vi } from 'vitest'
import {
  normaliseEmail,
  normalisePhone,
  buildCustomerKeys,
  findMatch,
  fieldsToEnrich,
  resolveCustomer,
  type MatchCandidate,
} from '@/lib/customer-match'

describe('normaliseEmail', () => {
  it('lowercases and trims', () => {
    expect(normaliseEmail('  John.Smith@Example.COM ')).toBe('john.smith@example.com')
  })

  it('returns null for blank input', () => {
    expect(normaliseEmail(null)).toBeNull()
    expect(normaliseEmail(undefined)).toBeNull()
    expect(normaliseEmail('')).toBeNull()
    expect(normaliseEmail('   ')).toBeNull()
  })

  it('rejects junk so it never becomes a shared match key', () => {
    expect(normaliseEmail('n/a')).toBeNull()
    expect(normaliseEmail('none')).toBeNull()
    expect(normaliseEmail('john@')).toBeNull()
    expect(normaliseEmail('john@example')).toBeNull()
  })
})

describe('normalisePhone', () => {
  it('strips formatting to digits', () => {
    expect(normalisePhone('(021) 555-1234')).toBe('0215551234')
    expect(normalisePhone('021 555 1234')).toBe('0215551234')
  })

  it('folds the NZ country code back to national format', () => {
    expect(normalisePhone('+64 21 555 1234')).toBe('0215551234')
    expect(normalisePhone('0064 21 555 1234')).toBe('0215551234')
  })

  it('matches the same number written three different ways', () => {
    const a = normalisePhone('+64 21 555 1234')
    const b = normalisePhone('021 555 1234')
    const c = normalisePhone('021-555-1234')
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('returns null for blank or too-short input', () => {
    expect(normalisePhone(null)).toBeNull()
    expect(normalisePhone('')).toBeNull()
    expect(normalisePhone('12345')).toBeNull()
    expect(normalisePhone('n/a')).toBeNull()
  })
})

describe('buildCustomerKeys', () => {
  it('uppercases the name per project convention', () => {
    const keys = buildCustomerKeys({ name: ' john smith ', email: 'J@e.com', phone: '021 555 1234' })
    expect(keys.name).toBe('JOHN SMITH')
    expect(keys.emailKey).toBe('j@e.com')
    expect(keys.phoneKey).toBe('0215551234')
  })

  it('handles a completely empty identity', () => {
    expect(buildCustomerKeys({})).toEqual({ name: '', emailKey: null, phoneKey: null })
  })
})

describe('findMatch', () => {
  const candidates: MatchCandidate[] = [
    { id: 'a', name: 'JOHN SMITH', emailKey: 'john@example.com', phoneKey: '0211111111' },
    { id: 'b', name: 'JANE DOE', emailKey: null, phoneKey: '0212222222' },
    { id: 'c', name: 'NO CONTACT', emailKey: null, phoneKey: null },
  ]

  it('matches on email first', () => {
    const keys = buildCustomerKeys({ name: 'J SMYTHE', email: 'JOHN@example.com', phone: '0219999999' })
    expect(findMatch(keys, candidates)?.id).toBe('a')
  })

  it('falls back to phone when email does not match', () => {
    const keys = buildCustomerKeys({ name: 'J DOE', email: 'new@example.com', phone: '+64 21 222 2222' })
    expect(findMatch(keys, candidates)?.id).toBe('b')
  })

  it('prefers email over phone when both match different people', () => {
    const keys = buildCustomerKeys({ name: 'X', email: 'john@example.com', phone: '0212222222' })
    expect(findMatch(keys, candidates)?.id).toBe('a')
  })

  it('matches on name only when there is no email and no phone', () => {
    const keys = buildCustomerKeys({ name: 'no contact' })
    expect(findMatch(keys, candidates)?.id).toBe('c')
  })

  it('does NOT fall through to a name match when an unmatched email was supplied', () => {
    // The guard against "JOHN SMITH" swallowing every other John Smith.
    const keys = buildCustomerKeys({ name: 'JOHN SMITH', email: 'different.john@example.com' })
    expect(findMatch(keys, candidates)).toBeNull()
  })

  it('does NOT fall through to a name match when an unmatched phone was supplied', () => {
    const keys = buildCustomerKeys({ name: 'JOHN SMITH', phone: '0218888888' })
    expect(findMatch(keys, candidates)).toBeNull()
  })

  it('returns null against an empty candidate list', () => {
    expect(findMatch(buildCustomerKeys({ name: 'ANYONE' }), [])).toBeNull()
  })

  it('never matches a null key against a null key', () => {
    const keys = buildCustomerKeys({ name: 'SOMEONE ELSE', email: null, phone: null })
    // 'b' and 'c' have null emailKey — a null/null comparison must not match.
    expect(findMatch(keys, candidates)).toBeNull()
  })
})

describe('fieldsToEnrich', () => {
  it('fills a blank phone on the existing record', () => {
    const existing: MatchCandidate = { id: 'a', name: 'JOHN', emailKey: 'j@e.com', phoneKey: null }
    const identity = { name: 'JOHN', email: 'j@e.com', phone: '021 555 1234' }
    const patch = fieldsToEnrich(existing, buildCustomerKeys(identity), identity)
    expect(patch).toEqual({ phone: '021 555 1234', phoneKey: '0215551234' })
  })

  it('never overwrites details we already hold', () => {
    const existing: MatchCandidate = { id: 'a', name: 'JOHN', emailKey: 'old@e.com', phoneKey: '0211111111' }
    const identity = { name: 'JOHN', email: 'new@e.com', phone: '0219999999' }
    expect(fieldsToEnrich(existing, buildCustomerKeys(identity), identity)).toEqual({})
  })

  it('returns an empty patch when there is nothing to add', () => {
    const existing: MatchCandidate = { id: 'a', name: 'JOHN', emailKey: null, phoneKey: null }
    expect(fieldsToEnrich(existing, buildCustomerKeys({ name: 'JOHN' }), { name: 'JOHN' })).toEqual({})
  })
})

describe('resolveCustomer', () => {
  function makeClient(existing: MatchCandidate[]) {
    return {
      customer: {
        findMany: vi.fn().mockResolvedValue(existing),
        create: vi.fn().mockResolvedValue({ id: 'new-id' }),
        update: vi.fn().mockResolvedValue({}),
      },
    }
  }

  it('creates a customer when nothing matches', async () => {
    const client = makeClient([])
    const id = await resolveCustomer(client, 'venue-1', {
      name: 'new person',
      email: 'New@Example.com',
      phone: '+64 21 555 1234',
    })

    expect(id).toBe('new-id')
    expect(client.customer.create).toHaveBeenCalledWith({
      data: {
        venueId: 'venue-1',
        name: 'NEW PERSON',
        email: 'New@Example.com',
        phone: '+64 21 555 1234',
        emailKey: 'new@example.com',
        phoneKey: '0215551234',
      },
    })
  })

  it('returns the existing id and does not create a duplicate', async () => {
    const client = makeClient([
      { id: 'existing', name: 'JOHN SMITH', emailKey: 'john@example.com', phoneKey: '0215551234' },
    ])
    const id = await resolveCustomer(client, 'venue-1', { name: 'J SMITH', email: 'JOHN@EXAMPLE.COM' })

    expect(id).toBe('existing')
    expect(client.customer.create).not.toHaveBeenCalled()
  })

  it('enriches a matched customer with a newly supplied phone', async () => {
    const client = makeClient([
      { id: 'existing', name: 'JOHN SMITH', emailKey: 'john@example.com', phoneKey: null },
    ])
    await resolveCustomer(client, 'venue-1', {
      name: 'JOHN SMITH',
      email: 'john@example.com',
      phone: '021 555 1234',
    })

    expect(client.customer.update).toHaveBeenCalledWith({
      where: { id: 'existing' },
      data: { phone: '021 555 1234', phoneKey: '0215551234' },
    })
  })

  it('does not write at all when a match needs no enrichment', async () => {
    const client = makeClient([
      { id: 'existing', name: 'JOHN SMITH', emailKey: 'john@example.com', phoneKey: '0215551234' },
    ])
    await resolveCustomer(client, 'venue-1', { name: 'JOHN SMITH', email: 'john@example.com' })

    expect(client.customer.update).not.toHaveBeenCalled()
    expect(client.customer.create).not.toHaveBeenCalled()
  })

  it('returns null for an unidentifiable contact rather than creating a junk row', async () => {
    const client = makeClient([])
    const id = await resolveCustomer(client, 'venue-1', { name: '', email: null, phone: null })

    expect(id).toBeNull()
    expect(client.customer.create).not.toHaveBeenCalled()
  })

  it('only queries by name when no email or phone is supplied', async () => {
    const client = makeClient([])
    await resolveCustomer(client, 'venue-1', { name: 'WALK IN' })

    expect(client.customer.findMany).toHaveBeenCalledWith({
      where: { venueId: 'venue-1', deletedAt: null, OR: [{ name: 'WALK IN' }] },
    })
  })

  it('falls back to email for the name when no name is supplied', async () => {
    const client = makeClient([])
    await resolveCustomer(client, 'venue-1', { email: 'solo@example.com' })

    expect(client.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'solo@example.com' }) }),
    )
  })
})
