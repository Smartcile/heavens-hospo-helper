import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, saveEventBlocks, validateBlockPayload, logEventEvent, loadBlockLibrary } =
  vi.hoisted(() => ({
    prisma: { event: { findFirst: vi.fn() } },
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
    saveEventBlocks: vi.fn(),
    validateBlockPayload: vi.fn(),
    logEventEvent: vi.fn(),
    loadBlockLibrary: vi.fn(),
  }))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/events.server', () => ({
  saveEventBlocks,
  validateBlockPayload,
  logEventEvent,
}))
vi.mock('@/lib/beo-block-defs.server', () => ({ loadBlockLibrary }))

import { PUT } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

const params = { params: { id: 'e1' } }

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.event.findFirst.mockResolvedValue({ id: 'e1', venueId: 'v1' })
  loadBlockLibrary.mockResolvedValue([])
  validateBlockPayload.mockReturnValue([])
  saveEventBlocks.mockResolvedValue({ saved: [{ id: 'b1', _clientId: 'b1' }], deleted: 0 })
})

describe('PUT /api/admin/events/[id]/blocks historyNote', () => {
  it('logs LLM_PASTE after a successful blocks save when a note is sent', async () => {
    const note = 'LLM_PASTE — 1 FIELD(S), 1 BLOCK(S)'
    const res = await PUT(req({ blocks: [{ type: 'NOTES', config: { text: 'X' } }], historyNote: note }), params)

    expect(res.status).toBe(200)
    expect(logEventEvent).toHaveBeenCalledWith('e1', 'BLOCKS', 'BLOCKS SAVED — 1 BLOCK(S)')
    expect(logEventEvent).toHaveBeenCalledWith('e1', 'LLM_PASTE', note)
    expect(logEventEvent).toHaveBeenCalledTimes(2)
  })

  it('does not log LLM_PASTE when the note is missing', async () => {
    const res = await PUT(req({ blocks: [] }), params)

    expect(res.status).toBe(200)
    expect(logEventEvent).toHaveBeenCalledTimes(1)
    expect(logEventEvent).toHaveBeenCalledWith('e1', 'BLOCKS', 'BLOCKS SAVED — 1 BLOCK(S)')
    expect(logEventEvent).not.toHaveBeenCalledWith('e1', 'LLM_PASTE', expect.anything())
  })

  it('does not log LLM_PASTE when the note is blank', async () => {
    await PUT(req({ blocks: [], historyNote: '   ' }), params)
    expect(logEventEvent).toHaveBeenCalledTimes(1)
    expect(logEventEvent).not.toHaveBeenCalledWith('e1', 'LLM_PASTE', expect.anything())
  })

  it('logs an arbitrary non-blank note trimmed', async () => {
    await PUT(req({ blocks: [], historyNote: '  OPERATOR NOTE  ' }), params)
    expect(logEventEvent).toHaveBeenCalledWith('e1', 'LLM_PASTE', 'OPERATOR NOTE')
  })

  it('does not save or log when a block type is invalid', async () => {
    validateBlockPayload.mockReturnValue(['BAR_TAB'])
    const res = await PUT(req({ blocks: [{ type: 'BAR_TAB' }], historyNote: 'LLM_PASTE — X' }), params)

    expect(res.status).toBe(400)
    expect(saveEventBlocks).not.toHaveBeenCalled()
    expect(logEventEvent).not.toHaveBeenCalled()
  })
})
