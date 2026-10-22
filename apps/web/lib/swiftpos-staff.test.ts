import { describe, it, expect } from 'vitest'
import {
  buildClerkRows,
  normaliseName,
  parseClerks,
  splitClerkName,
  validClerkPin,
  type SwiftPosStaffRef,
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
