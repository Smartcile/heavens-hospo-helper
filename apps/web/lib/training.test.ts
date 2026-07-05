import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockStaffFindUnique, mockAssignFindMany, mockModuleFindMany, mockCompletionFindMany } = vi.hoisted(() => ({
  mockStaffFindUnique: vi.fn(),
  mockAssignFindMany: vi.fn(),
  mockModuleFindMany: vi.fn(),
  mockCompletionFindMany: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({
  prisma: {
    staff: { findUnique: mockStaffFindUnique },
    trainingAssignment: { findMany: mockAssignFindMany },
    trainingModule: { findMany: mockModuleFindMany },
    trainingCompletion: { findMany: mockCompletionFindMany },
  },
}))

import { getStaffTraining } from '@/lib/training'

const mockStaff = { id: 's1', firstName: 'BAR', lastName: 'MANAGER', venueId: 'v1', departmentId: 'd1' }
const mockModule = {
  id: 'm1', title: 'FOOD SAFETY', description: 'Core rules', category: 'FOOD SAFETY',
  requiresSignOff: true, isOnboarding: true, onboardingOrder: 1, departmentId: 'd1',
  linkedTaskId: null, version: 1, department: { id: 'd1', name: 'BAR' },
  linkedTask: null, steps: [],
}

describe('getStaffTraining', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when staff not found', async () => {
    mockStaffFindUnique.mockResolvedValue(null)
    const result = await getStaffTraining('unknown')
    expect(result).toBeNull()
  })

  it('returns training items with ONBOARDING source', async () => {
    mockStaffFindUnique.mockResolvedValue(mockStaff)
    mockAssignFindMany.mockResolvedValue([])
    mockModuleFindMany.mockResolvedValue([mockModule])
    mockCompletionFindMany.mockResolvedValue([])

    const result = await getStaffTraining('s1')
    expect(result).not.toBeNull()
    expect(result!.items[0].title).toBe('FOOD SAFETY')
    expect(result!.items[0].source).toBe('ONBOARDING')
  })

  it('marks items as ASSIGNED when individually assigned', async () => {
    mockStaffFindUnique.mockResolvedValue(mockStaff)
    mockAssignFindMany.mockResolvedValue([{ moduleId: 'm1', reason: 'UPSKILL' }])
    mockModuleFindMany.mockResolvedValue([mockModule])
    mockCompletionFindMany.mockResolvedValue([])

    const result = await getStaffTraining('s1')
    expect(result!.items[0].source).toBe('ASSIGNED')
  })
})
