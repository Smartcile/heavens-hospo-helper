import { describe, expect, it } from 'vitest'
import {
  applyMemberCleanAnswer,
  buildMemberCleanPrompt,
  buildMemberPreview,
  detectMemberColumns,
  effectiveMemberRows,
  memberCustomerName,
  parseMemberCleanAnswer,
  prepareCommitRows,
  SWIFTPOS_MEMBER_HEADER,
  toSwiftPosCsv,
} from './member-import'
import type { ExistingMember } from './member-import'

const CSV = [
  'First Name,Last Name,Membership Number ,Member Type,Member Status,Email,Phone Number',
  'ALICE,SMITH,101,Veteran,Current,alice@example.com,',
  'BOB,SMITH,102.1,Family,Current,,',
  'CAROL,JONES,102.2,Family,Current,,',
  'DAVE,DAVISON,103,Senior,Resigned,,',
  'EVE,,,Senior,Current,,',
].join('\n')

const mapping = { typeActive: 3, statusActive: 1, typeRemoved: 9, statusRemoved: 0 }

describe('member-import', () => {
  it('detects columns with trailing spaces and decorated headers', () => {
    const detected = detectMemberColumns([
      'First Name',
      'Last Name',
      'Membership Number ',
      'Member Type',
      'Member Status',
      'Phone Number',
      'Record ID',
    ])
    expect(detected.firstName).toBe('First Name')
    expect(detected.lastName).toBe('Last Name')
    expect(detected.membershipNumber).toBe('Membership Number ')
    expect(detected.phone).toBe('Phone Number')
    expect(detected.externalId).toBe('Record ID')
  })

  it('parses, cleans, collapses families and marks retired rows inactive', () => {
    const preview = buildMemberPreview(CSV)
    expect(preview.missing).toEqual([])
    expect(preview.rows).toHaveLength(5)
    expect(preview.rows[0].firstName).toBe('Alice')
    expect(preview.rows[0].isActive).toBe(true)
    expect(preview.rows[3].isActive).toBe(false)
    expect(preview.families).toHaveLength(1)
    expect(preview.families[0].membershipNumber).toBe('102')
    expect(preview.families[0].surnames).toBe('Smith/Jones (Family)')
    expect(preview.rows[4].include).toBe(false)
    expect(preview.rows[4].issues.some((i) => i.code === 'INVALID_MEMBERSHIP_NUMBER')).toBe(true)

    expect(effectiveMemberRows(preview.rows)).toHaveLength(3)
    expect(preview.summary.memberships).toBe(3)
    expect(preview.summary.inactive).toBe(1)
    expect(preview.summary.families).toBe(1)
  })

  it('keeps the previous family primary when it is still present', () => {
    const preview = buildMemberPreview(CSV, { previousPrimaryName: { '102': 'Carol' } })
    const family = preview.families[0]
    expect(family.primaryRowId).toBe('r4')
    expect(preview.rows.find((r) => r.id === 'r4')?.isPrimary).toBe(true)
  })

  it('marks NEW / UPDATE / UNCHANGED against existing members', () => {
    const existing: Record<string, ExistingMember> = {
      '101': {
        firstName: 'Alicia',
        lastName: 'Smith',
        isActive: true,
        isPrimary: true,
        familySurnames: null,
      },
      '102': {
        firstName: 'Bob',
        lastName: 'Smith',
        isActive: true,
        isPrimary: true,
        familySurnames: 'Smith/Jones (Family)',
      },
    }
    const preview = buildMemberPreview(CSV, { existing })
    expect(preview.rows.find((r) => r.id === 'r2')?.action).toBe('UPDATE')
    expect(preview.rows.find((r) => r.id === 'r3')?.action).toBe('UNCHANGED')
  })

  it('flags a missing membership-number column', () => {
    const preview = buildMemberPreview('First Name,Last Name\nAlice,Smith')
    expect(preview.missing).toContain('MEMBERSHIP NUMBER')
    expect(preview.issues[0].code).toBe('MISSING_COLUMNS')
  })

  it('builds a minimal AI prompt with no contact data', () => {
    const preview = buildMemberPreview(CSV)
    const prompt = buildMemberCleanPrompt(preview.rows, 'all')
    expect(prompt).toContain('r2')
    expect(prompt).toContain('Alice')
    expect(prompt).not.toContain('alice@example.com')
    expect(prompt).not.toContain('Phone')
  })

  it('parses and applies a clean answer', () => {
    const preview = buildMemberPreview(CSV)
    const answer = parseMemberCleanAnswer(
      '```json\n{"rows":[{"rowId":"r2","firstName":"Alice","lastName":"Smith"},{"rowId":"r4","isPrimary":true}]}\n```',
    )
    const applied = applyMemberCleanAnswer(preview.rows, answer)
    expect(applied.find((r) => r.id === 'r2')?.firstName).toBe('Alice')
    expect(applied.find((r) => r.id === 'r4')?.isPrimary).toBe(true)
    expect(applied.find((r) => r.id === 'r3')?.isPrimary).toBe(false)
  })

  it('prepares one commit row per family and exports the SwiftPOS CSV', () => {
    const preview = buildMemberPreview(CSV)
    const { rows, issues } = prepareCommitRows(preview.rows)
    expect(issues).toEqual([])
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.baseNumber === '102')).toMatchObject({
      firstName: 'Bob',
      isFamily: true,
      lastName: 'Smith/Jones (Family)',
    })

    const csv = toSwiftPosCsv(preview.rows, mapping)
    const lines = csv.split('\r\n')
    expect(lines[0]).toContain('First Name')
    expect(lines[0]).toContain('Membership Number')
    expect(lines).toContain('Alice,Smith,101,3,1')
    expect(lines).toContain('Bob,Smith/Jones (Family),102,3,1')
    expect(lines).toContain('Dave,Davison,103,9,0')
    expect(lines).toHaveLength(4)
    expect(SWIFTPOS_MEMBER_HEADER.join(',')).toContain('Membership Number')
  })

  it('builds a clean customer name for a family', () => {
    expect(
      memberCustomerName({
        firstName: 'Bob',
        lastName: 'Smith',
        isFamily: true,
        familySurnames: 'Smith/Jones (Family)',
      }),
    ).toBe('Bob Smith')
    expect(memberCustomerName({ firstName: 'Alice', lastName: 'Smith' })).toBe('Alice Smith')
  })

  it('skips invalid numbers at commit time', () => {
    const preview = buildMemberPreview(CSV)
    const withBadNumber = preview.rows.map((row) =>
      row.id === 'r2' ? { ...row, baseNumber: 'ABC', membershipNumber: 'ABC' } : row,
    )
    const { rows, issues } = prepareCommitRows(withBadNumber)
    expect(rows).toHaveLength(2)
    expect(issues.some((i) => i.code === 'INVALID_MEMBERSHIP_NUMBER')).toBe(true)
  })
})
