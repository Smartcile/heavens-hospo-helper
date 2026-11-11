import { describe, expect, it } from 'vitest'
import {
  buildWarnings,
  filterWarnings,
  formatWarningDate,
  groupWarningsByFolder,
  guideTrainingState,
  sortWarnings,
  warningReasonText,
  warningSummary,
  type WarningBuildInput,
  type WarningFolder,
  type WarningGuide,
} from '@/lib/guide-warnings'

const NOW = new Date('2026-11-12T00:00:00Z')

const folders: Record<string, WarningFolder> = {
  f1: { id: 'f1', name: 'BAR', sortOrder: 0 },
  f2: { id: 'f2', name: 'KITCHEN', sortOrder: 1 },
}

const guides: Record<string, WarningGuide> = {
  g1: { id: 'g1', title: 'COFFEE MENU', folderId: 'f1', requiresSignOff: false, updatedAt: '2026-10-01T00:00:00Z' },
  g2: { id: 'g2', title: 'SIGN OFF SHEET', folderId: 'f1', requiresSignOff: true, updatedAt: '2026-10-01T00:00:00Z' },
  g3: { id: 'g3', title: 'UP TO DATE', folderId: 'f2', requiresSignOff: false, updatedAt: '2026-09-01T00:00:00Z' },
  g4: { id: 'g4', title: 'ALLERGY PROCESS', folderId: 'f2', requiresSignOff: false, updatedAt: '2026-09-01T00:00:00Z' },
  g5: { id: 'g5', title: 'OPENING LIST', folderId: null, requiresSignOff: false, updatedAt: '2026-09-01T00:00:00Z' },
}

function input(overrides: Partial<WarningBuildInput['staff'][number]> = {}): WarningBuildInput {
  return {
    now: NOW,
    guides,
    folders,
    staff: [
      {
        id: 's1',
        name: 'SMITH, JANE',
        requiredGuideIds: ['g1', 'g2', 'g3', 'g5'],
        completions: {
          g1: { completedAt: '2026-09-01T00:00:00Z', selfCompleted: true, signedOffById: null },
          g3: { completedAt: '2026-11-05T00:00:00Z', selfCompleted: true, signedOffById: null },
        },
        retrainRequests: [],
        followUps: [],
        ...overrides,
      },
    ],
  }
}

describe('buildWarnings', () => {
  it('derives stale, sign-off pending and missing warnings', () => {
    const warnings = buildWarnings(input())
    const byGuide = new Map(warnings.map((w) => [w.guideId, w]))

    expect(byGuide.get('g1')?.kind).toBe('STALE')
    expect(byGuide.get('g1')?.severity).toBe('CRITICAL')
    expect(byGuide.get('g1')?.folderName).toBe('BAR')
    expect(byGuide.get('g1')?.reasonText).toContain('Guide changed on 1 OCT 2026')
    expect(byGuide.get('g2')?.kind).toBe('SIGN_OFF_PENDING')
    expect(byGuide.get('g3')).toBeUndefined()
    expect(byGuide.get('g5')?.kind).toBe('MISSING')
  })

  it('uses an explicit retrain request instead of a duplicate stale warning', () => {
    const warnings = buildWarnings(
      input({
        retrainRequests: [
          { id: 'r1', guideId: 'g1', reason: 'MENU CHANGED', requestedAt: '2026-11-10T00:00:00Z' },
        ],
      }),
    )
    const forG1 = warnings.filter((w) => w.guideId === 'g1')
    expect(forG1).toHaveLength(1)
    expect(forG1[0].kind).toBe('RETRAIN_REQUESTED')
    expect(forG1[0].requestId).toBe('r1')
    expect(forG1[0].reasonText).toContain('MENU CHANGED')
  })

  it('marks a request older than the overdue window as OVERDUE', () => {
    const warnings = buildWarnings(
      input({
        retrainRequests: [
          { id: 'r2', guideId: 'g4', reason: null, requestedAt: '2026-10-01T00:00:00Z' },
        ],
      }),
    )
    const request = warnings.find((w) => w.requestId === 'r2')!
    expect(request.kind).toBe('OVERDUE')
    expect(request.severity).toBe('CRITICAL')
    expect(request.reasonText).toContain('not done yet')
    expect(request.due).toBe('2026-10-15T00:00:00.000Z')
  })

  it('includes open follow-ups as their own critical warning', () => {
    const warnings = buildWarnings(
      input({
        followUps: [
          { id: 'fu1', kind: 'UNTRAINED', guideId: 'g4', dueDate: null, detail: null },
        ],
      }),
    )
    const followUp = warnings.find((w) => w.followUpId === 'fu1')!
    expect(followUp.kind).toBe('FOLLOW_UP')
    expect(followUp.severity).toBe('CRITICAL')
    expect(followUp.guideTitle).toBe('ALLERGY PROCESS')
    expect(followUp.reasonText).toContain('Training is required')
  })
})

describe('reason text', () => {
  it('formats a deterministic date and plain-English stale reason', () => {
    expect(formatWarningDate('2026-10-01T00:00:00Z')).toBe('1 OCT 2026')
    expect(
      warningReasonText('STALE', {
        changedAt: '2026-10-01T00:00:00Z',
        completedAt: '2026-09-01T00:00:00Z',
      }),
    ).toBe('Guide changed on 1 OCT 2026 — training was completed on 1 SEP 2026.')
  })
})

describe('filter / sort / group', () => {
  const built = buildWarnings(
    input({
      retrainRequests: [
        { id: 'r1', guideId: 'g4', reason: 'MENU CHANGED', requestedAt: '2026-11-10T00:00:00Z' },
      ],
      followUps: [{ id: 'fu1', kind: 'MISSED', guideId: null, dueDate: null, detail: null }],
    }),
  )

  it('filters by kind, severity, folder and search', () => {
    expect(filterWarnings(built, { kind: 'STALE' })).toHaveLength(1)
    expect(filterWarnings(built, { severity: 'CRITICAL' }).length).toBeGreaterThan(1)
    expect(filterWarnings(built, { folderId: 'f2' }).every((w) => w.folderId === 'f2')).toBe(true)
    expect(filterWarnings(built, { folderId: 'UNFILED' }).map((w) => w.guideId)).toContain('g5')
    expect(filterWarnings(built, { search: 'allergy' })).toHaveLength(1)
  })

  it('sorts most urgent first and oldest first', () => {
    const urgent = sortWarnings(built, 'severity')
    expect(urgent[0].severity).toBe('CRITICAL')
    const oldest = sortWarnings(built, 'oldest')
    expect(oldest[0].since).toBe('2026-10-01T00:00:00Z')
  })

  it('groups only folders with warnings, plus an unfiled bucket', () => {
    const groups = groupWarningsByFolder(built, Object.values(folders))
    expect(groups.map((g) => g.folder?.name ?? 'UNFILED')).toEqual(['BAR', 'KITCHEN', 'UNFILED'])
  })

  it('counts urgent warnings', () => {
    const summary = warningSummary(built)
    expect(summary.total).toBe(built.length)
    expect(summary.critical + summary.warning).toBe(built.length)
  })
})

describe('guideTrainingState', () => {
  it('flags a stale completion with a reason', () => {
    const state = guideTrainingState({
      updatedAt: '2026-10-01T00:00:00Z',
      requiresSignOff: false,
      completion: { completedAt: '2026-09-01T00:00:00Z' },
      request: null,
      now: NOW,
    })
    expect(state.needsAction).toBe(true)
    expect(state.stale).toBe(true)
    expect(state.severity).toBe('CRITICAL')
  })

  it('says a pending request is the reason', () => {
    const state = guideTrainingState({
      updatedAt: '2026-09-01T00:00:00Z',
      requiresSignOff: false,
      completion: { completedAt: '2026-11-01T00:00:00Z' },
      request: { id: 'r1', guideId: 'g1', reason: 'SEEN UNSAFE', requestedAt: '2026-11-10T00:00:00Z' },
      now: NOW,
    })
    expect(state.stale).toBe(true)
    expect(state.requestId).toBe('r1')
    expect(state.reasonText).toContain('SEEN UNSAFE')
  })

  it('clears when the completion is newer than the guide change', () => {
    const state = guideTrainingState({
      updatedAt: '2026-09-01T00:00:00Z',
      requiresSignOff: false,
      completion: { completedAt: '2026-11-01T00:00:00Z' },
      request: null,
      now: NOW,
    })
    expect(state.needsAction).toBe(false)
    expect(state.reasonText).toBeNull()
  })
})
