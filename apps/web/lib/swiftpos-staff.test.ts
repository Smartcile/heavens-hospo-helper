import { describe, it, expect } from 'vitest'
import {
  buildClerkRows,
  clerkCodeConflict,
  findPinClash,
  normaliseName,
  parseClerks,
  resolveClerkPin,
  resolveCreatedName,
  splitClerkName,
  validClerkPin,
  type SwiftPosStaffRef,
  type VenueStaffRow,
} from '@/lib/swiftpos-staff'

const staff = (over: Partial<SwiftPosStaffRef> & { id: string }): SwiftPosStaffRef => ({
  firstName: 'JANE',
  lastName: 'DOE',
  swiftPosId: null,
  ...over,
})

describe('parseClerks', () => {
  it('reads camelCase and PascalCase clerk rows', () => {
    expect(parseClerks({
      clerks: [
        { value: '1', text: 'Jane Doe' },
        { Value: '2', Text: 'John Smith' },
      ],
    })).toEqual([
      { clerkId: '1', name: 'Jane Doe' },
      { clerkId: '2', name: 'John Smith' },
    ])
  })

  it('accepts a numeric clerk id, trims, and dedupes', () => {
    expect(parseClerks({
      Clerks: [
        { value: 7, text: '  Jane Doe ' },
        { value: '7', text: 'Jane Doe (again)' },
        { value: '', text: 'No id' },
      ],
    })).toEqual([{ clerkId: '7', name: 'Jane Doe' }])
  })

  it('returns an empty list for unrelated payloads', () => {
    expect(parseClerks(null)).toEqual([])
    expect(parseClerks({ clerks: 'nope' })).toEqual([])
  })
})

describe('splitClerkName', () => {
  it('splits first-name-first names', () => {
    expect(splitClerkName('Jane Doe')).toEqual({ firstName: 'JANE', lastName: 'DOE' })
  })

  it('splits surname-first names with a comma', () => {
    expect(splitClerkName('Doe, Jane')).toEqual({ firstName: 'JANE', lastName: 'DOE' })
  })

  it('keeps multi-part first names', () => {
    expect(splitClerkName('Mary Jane Smith')).toEqual({ firstName: 'MARY JANE', lastName: 'SMITH' })
  })

  it('handles a single token and blanks', () => {
    expect(splitClerkName('Jane')).toEqual({ firstName: 'JANE', lastName: '' })
    expect(splitClerkName('   ')).toEqual({ firstName: '', lastName: '' })
  })
})

describe('normaliseName', () => {
  it('uppercases, strips punctuation and collapses spaces', () => {
    expect(normaliseName("  Jane  O'Doe-Smith ")).toBe('JANE O DOE SMITH')
  })
})

describe('validClerkPin', () => {
  it('accepts 1–4 digits only', () => {
    expect(validClerkPin('1')).toBe(true)
    expect(validClerkPin('1234')).toBe(true)
    expect(validClerkPin(' 12 ')).toBe(true)
    expect(validClerkPin('12345')).toBe(false)
    expect(validClerkPin('12a')).toBe(false)
    expect(validClerkPin('')).toBe(false)
  })
})

describe('buildClerkRows', () => {
  it('marks a clerk LINKED by exact code, case-insensitively', () => {
    const rows = buildClerkRows(
      [{ clerkId: 'ab12', name: 'Jane Doe' }],
      [staff({ id: 's1', swiftPosId: 'AB12' })],
    )
    expect(rows[0]).toMatchObject({
      status: 'LINKED',
      staffId: 's1',
      staffName: 'JANE DOE',
      suggestedStaffId: null,
    })
  })

  it('suggests the one unlinked staff member with the same name tokens', () => {
    const rows = buildClerkRows(
      [{ clerkId: '2', name: 'Doe, Jane' }],
      [staff({ id: 's1' }), staff({ id: 's2', firstName: 'JOHN', lastName: 'SMITH' })],
    )
    expect(rows[0]).toMatchObject({ status: 'SUGGESTED', suggestedStaffId: 's1' })
  })

  it('does not suggest when two unlinked staff share the name', () => {
    const rows = buildClerkRows(
      [{ clerkId: '2', name: 'Jane Doe' }],
      [staff({ id: 's1' }), staff({ id: 's2' })],
    )
    expect(rows[0]).toMatchObject({ status: 'NEW', suggestedStaffId: null })
  })

  it('never suggests a staff member already linked to another clerk', () => {
    const rows = buildClerkRows(
      [{ clerkId: '2', name: 'Jane Doe' }],
      [staff({ id: 's1', swiftPosId: '9' })],
    )
    expect(rows[0]).toMatchObject({ status: 'NEW', suggestedStaffId: null })
  })

  it('leaves an unnamed clerk as NEW', () => {
    const rows = buildClerkRows([{ clerkId: '3', name: '' }], [staff({ id: 's1' })])
    expect(rows[0]).toMatchObject({ status: 'NEW', suggestedStaffId: null })
  })
})

const venueStaff = (over: Partial<VenueStaffRow> & { id: string }): VenueStaffRow => ({
  firstName: 'JANE',
  lastName: 'DOE',
  swiftPosId: null,
  isActive: true,
  pin: null,
  ...over,
})

describe('clerkCodeConflict (LINK)', () => {
  it('finds another staff member holding the code, case-insensitively', () => {
    const staffRows = [venueStaff({ id: 's1', swiftPosId: 'ab12' })]
    expect(clerkCodeConflict(staffRows, 'AB12')?.id).toBe('s1')
  })

  it('excludes the staff member being re-linked to its own code', () => {
    const staffRows = [venueStaff({ id: 's1', swiftPosId: 'AB12' })]
    expect(clerkCodeConflict(staffRows, 'AB12', 's1')).toBeNull()
  })

  it('ignores unlinked staff and a missing code', () => {
    const staffRows = [venueStaff({ id: 's1' }), venueStaff({ id: 's2', swiftPosId: null })]
    expect(clerkCodeConflict(staffRows, 'AB12')).toBeNull()
    expect(clerkCodeConflict(staffRows, '  ')).toBeNull()
  })
})

describe('resolveCreatedName / resolveClerkPin (CREATE)', () => {
  it('splits the clerk name when no explicit name is given', () => {
    expect(resolveCreatedName({}, 'Doe, Jane')).toEqual({ firstName: 'JANE', lastName: 'DOE' })
  })

  it('prefers an explicit name and uppercases it', () => {
    expect(resolveCreatedName({ firstName: ' jane ', lastName: 'Doe' }, 'John Smith')).toEqual({
      firstName: 'JANE',
      lastName: 'DOE',
    })
  })

  it('ignores malformed name parts instead of throwing', () => {
    expect(
      resolveCreatedName({ firstName: 42, lastName: { nope: true } }, 'Doe, Jane'),
    ).toEqual({ firstName: 'JANE', lastName: 'DOE' })
    expect(resolveCreatedName({}, 99)).toEqual({ firstName: '', lastName: '' })
  })

  it('defaults the PIN to the clerk number, unless a pin is supplied', () => {
    expect(resolveClerkPin(undefined, ' 42 ')).toBe('42')
    expect(resolveClerkPin('', '42')).toBe('42')
    expect(resolveClerkPin(' 9999 ', '42')).toBe('9999')
  })
})

describe('findPinClash (PIN clash handling)', () => {
  const compare = async (plain: string, hash: string) => hash === `h:${plain}`

  it('returns the active staff member whose PIN matches', async () => {
    const rows = [
      venueStaff({ id: 's1', pin: 'h:1234' }),
      venueStaff({ id: 's2', firstName: 'JOHN', pin: 'h:9999' }),
    ]
    expect((await findPinClash(rows, '9999', compare))?.id).toBe('s2')
  })

  it('skips inactive staff and staff with no PIN', async () => {
    const rows = [
      venueStaff({ id: 's1', isActive: false, pin: 'h:1234' }),
      venueStaff({ id: 's2', pin: null }),
    ]
    expect(await findPinClash(rows, '1234', compare)).toBeNull()
  })

  it('returns null when nothing matches', async () => {
    expect(await findPinClash([venueStaff({ id: 's1', pin: 'h:1111' })], '2222', compare)).toBeNull()
  })
})
