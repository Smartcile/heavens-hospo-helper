import { describe, expect, it } from 'vitest'
import {
  buildFamilyLastName,
  dedupeSurnameFromFirstName,
  isInactiveStatus,
  normaliseMembershipNumber,
  normaliseSpaces,
  parseFamilyLastName,
  splitDisplayName,
  titleCaseName,
} from './member-name'

describe('member-name', () => {
  it('normalises spaces and invisible characters', () => {
    expect(normaliseSpaces('  Jane\u00a0  Doe \u200b')).toBe('Jane Doe')
  })

  it('title-cases given names and surnames with particles', () => {
    expect(titleCaseName('ALAN SMITH')).toBe('Alan Smith')
    expect(titleCaseName("o'connor")).toBe("O'Connor")
    expect(titleCaseName('MCLAREN', { surname: true })).toBe('McLaren')
    expect(titleCaseName('van den anker', { surname: true })).toBe('van den Anker')
    expect(titleCaseName('MacLAREN', { surname: true })).toBe('MacLaren')
    expect(titleCaseName('DE', { surname: true })).toBe('De')
  })

  it('removes a repeated surname from the first name', () => {
    expect(dedupeSurnameFromFirstName('Sue JOHN', 'JOHN').firstName).toBe('Sue')
    expect(dedupeSurnameFromFirstName('Jamie HUTCHENS', 'HUTCHENS (Family)').firstName).toBe('Jamie')
    expect(dedupeSurnameFromFirstName('Brian James', 'Jones').firstName).toBe('Brian James')
    expect(dedupeSurnameFromFirstName('JOHN JOHN', 'Smith').firstName).toBe('John')
    expect(dedupeSurnameFromFirstName('M Wong', 'Wong').firstName).toBe('M')
  })

  it('parses family surnames from the various export shapes', () => {
    expect(parseFamilyLastName('Baff (Cree Family)')).toEqual({
      isFamily: true,
      surnames: ['Baff', 'Cree'],
      hasMarker: true,
    })
    expect(parseFamilyLastName('Hume (Family').surnames).toEqual(['Hume'])
    expect(parseFamilyLastName('Baff/Cree').isFamily).toBe(true)
    expect(parseFamilyLastName('Smith')).toEqual({ isFamily: false, surnames: ['Smith'], hasMarker: false })
  })

  it('builds the SwiftPOS family surname', () => {
    expect(buildFamilyLastName(['Baff', 'Cree'])).toBe('Baff/Cree (Family)')
    expect(buildFamilyLastName(['baff', 'BAFF', 'Cree'])).toBe('Baff/Cree (Family)')
    expect(buildFamilyLastName(['Smith'])).toBe('Smith (Family)')
  })

  it('normalises membership numbers and family suffixes', () => {
    expect(normaliseMembershipNumber(' 444.1 ')).toEqual({
      raw: '444.1',
      base: '444',
      suffix: '1',
      isFamily: true,
    })
    expect(normaliseMembershipNumber('837.')).toEqual({
      raw: '837.',
      base: '837',
      suffix: '',
      isFamily: false,
    })
    expect(normaliseMembershipNumber('ABC')).toBeNull()
    expect(normaliseMembershipNumber('')).toBeNull()
  })

  it('treats only retired-style statuses as inactive', () => {
    expect(isInactiveStatus('Resigned')).toBe(true)
    expect(isInactiveStatus('Trial Resigned')).toBe(true)
    expect(isInactiveStatus('Deceased')).toBe(true)
    expect(isInactiveStatus('Resign Pending')).toBe(false)
    expect(isInactiveStatus('Overdue')).toBe(false)
    expect(isInactiveStatus('Current')).toBe(false)
    expect(isInactiveStatus('')).toBe(false)
  })

  it('splits display names without inventing a surname', () => {
    expect(splitDisplayName('Sue Smith')).toEqual({ firstName: 'Sue', lastName: 'Smith' })
    expect(splitDisplayName('Smith, Sue')).toEqual({ firstName: 'Sue', lastName: 'Smith' })
    expect(splitDisplayName('Cher')).toEqual({ firstName: 'Cher', lastName: '' })
  })
})
