import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { StaffGuidesModal } from '@/components/admin/StaffGuidesModal'

const folders = [{ id: 'f1', name: 'BAR', sortOrder: 0 }]

const items = [
  {
    id: 'g1',
    title: 'COFFEE MENU',
    category: null,
    requiresSignOff: false,
    isOnboarding: false,
    folderId: 'f1',
    folderName: 'BAR',
    updatedAt: '2026-10-01T00:00:00.000Z',
    source: 'DEPARTMENT',
    assignmentReason: null,
    completed: true,
    stale: true,
    needsAction: true,
    severity: 'CRITICAL',
    reasonText: 'Guide changed on 1 OCT 2026 — training was completed on 1 SEP 2026.',
    retrainRequestId: null,
    completion: {
      completedAt: '2026-09-01T00:00:00.000Z',
      selfCompleted: true,
      signedOffByName: null,
      note: null,
    },
  },
  {
    id: 'g2',
    title: 'OPENING LIST',
    category: null,
    requiresSignOff: false,
    isOnboarding: false,
    folderId: null,
    folderName: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    source: 'ASSIGNED',
    assignmentReason: null,
    completed: false,
    stale: false,
    needsAction: true,
    severity: 'WARNING',
    reasonText: 'Required guide has not been completed yet.',
    retrainRequestId: null,
    completion: null,
  },
]

function mockFetch() {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url: string | URL | Request) => {
    const u = String(url)
    if (u.includes('/api/admin/staff/s1/guides')) {
      return { ok: true, json: async () => ({ items, folders }) } as Response
    }
    if (u.includes('/api/admin/guides')) {
      return { ok: true, json: async () => [] } as Response
    }
    return { ok: true, json: async () => ({}) } as Response
  })
}

describe('StaffGuidesModal folder grouping + retrain warnings', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('groups by folder, keeps a flat all-guides view, and flags the stale row', async () => {
    mockFetch()
    const { getByText, queryByText, getAllByText } = render(
      <StaffGuidesModal staffId="s1" staffName="SMITH, JANE" onClose={() => {}} />,
    )

    await waitFor(() => expect(getByText('BAR (1)')).toBeTruthy())
    expect(getByText('COFFEE MENU')).toBeTruthy()
    // The unfiled bucket holds the assigned guide.
    expect(getByText('UNFILED (1)')).toBeTruthy()
    expect(getByText(/GUIDE CHANGED ON 1 OCT 2026/)).toBeTruthy()
    expect(getAllByText('MARK RETRAINED').length).toBe(1)

    fireEvent.click(getByText('ALL GUIDES'))
    await waitFor(() => expect(queryByText('BAR (1)')).toBeNull())
    expect(getByText('COFFEE MENU')).toBeTruthy()
    expect(getByText('OPENING LIST')).toBeTruthy()
  })

  it('opens the shared mark-for-retraining flow for a warning', async () => {
    mockFetch()
    const { getByText, getAllByText } = render(
      <StaffGuidesModal staffId="s1" staffName="SMITH, JANE" onClose={() => {}} />,
    )

    await waitFor(() => expect(getByText('COFFEE MENU')).toBeTruthy())
    fireEvent.click(getAllByText('MARK FOR RETRAINING')[0])

    await waitFor(() => expect(getByText('PERSON')).toBeTruthy())
    expect(getByText('MARK 1 FOR RETRAINING')).toBeTruthy()
  })
})
