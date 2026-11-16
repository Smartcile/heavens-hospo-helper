import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemberImportModal } from './MemberImportModal'
import type { MemberImportPreview, MemberImportRow } from '@/lib/member-import'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

const row: MemberImportRow = {
  id: 'r2',
  sourceRow: 2,
  membershipNumber: '101',
  baseNumber: '101',
  suffix: '',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  memberType: 'Veteran',
  email: '',
  phone: '',
  memberInterests: '',
  company: '',
  externalId: '',
  isFamily: false,
  isPrimary: true,
  familySurnames: '',
  isActive: true,
  activeSource: 'STATUS',
  include: true,
  needsAi: false,
  action: 'NEW',
  issues: [],
  rawSurnames: ['Smith'],
}

const preview: MemberImportPreview = {
  headers: ['First Name', 'Last Name', 'Membership Number ', 'Member Type'],
  detected: { firstName: 'First Name', lastName: 'Last Name', membershipNumber: 'Membership Number ' },
  used: { firstName: 'First Name', lastName: 'Last Name', membershipNumber: 'Membership Number ' },
  missing: [],
  rows: [row],
  families: [],
  issues: [],
  summary: {
    rows: 1,
    included: 1,
    memberships: 1,
    new: 1,
    updated: 0,
    unchanged: 0,
    inactive: 0,
    errors: 0,
    families: 0,
  },
}

const group = {
  id: 'g1',
  venueId: 'v1',
  name: 'RAYC MEMBERS',
  slug: 'rayc-members',
  kind: 'MEMBER_DATABASE' as const,
  description: null,
  colour: null,
  isActive: true,
  sortOrder: 0,
  areas: ['CUSTOMERS'],
  mapping: { typeActive: 3, statusActive: 1, typeRemoved: 9, statusRemoved: 0, exportEncoding: 'UTF8_BOM' },
  memberCount: 1,
  createdAt: '',
  updatedAt: '',
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation((url: string) => {
    if (url === '/api/admin/customer-memberships/import/preview') {
      return jsonResponse({ preview })
    }
    if (url === '/api/admin/customer-memberships/import/commit') {
      return jsonResponse({ created: 1, updated: 0, total: 1, issues: [] })
    }
    return jsonResponse({})
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MemberImportModal', () => {
  it('previews the file and commits the reviewed rows', async () => {
    const onImported = vi.fn()
    const { container } = render(
      <MemberImportModal
        isOpen
        onClose={() => {}}
        venueId="v1"
        groups={[group]}
        defaultGroupId="g1"
        onImported={onImported}
      />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(
      ['First Name,Last Name,Membership Number \nALICE,SMITH,101'],
      'members.csv',
      { type: 'text/csv' },
    )
    fireEvent.change(fileInput, { target: { files: [file] } })
    fireEvent.click(screen.getByText('PREVIEW IMPORT'))

    expect(await screen.findByText(/REVIEW IMPORT/)).toBeInTheDocument()
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    fireEvent.click(screen.getByText('IMPORT 1 MEMBERSHIPS'))

    expect(await screen.findByText('IMPORT COMPLETE')).toBeInTheDocument()
    expect(onImported).toHaveBeenCalled()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/customer-memberships/import/commit',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})
