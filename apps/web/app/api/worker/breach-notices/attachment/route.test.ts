import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { getWorkerSession, saveImageUpload } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  saveImageUpload: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/upload-image.server', () => ({ saveImageUpload }))

import { POST } from './route'
import { BREACH_ATTACHMENT_MAX_BYTES } from '@/lib/breach-notices'

function reqWith(form: FormData): NextRequest {
  return { formData: async () => form } as unknown as NextRequest
}

function formWith(file: File): FormData {
  const form = new FormData()
  form.append('file', file)
  return form
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
})

describe('POST /api/worker/breach-notices/attachment', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)
    const res = await POST(reqWith(formWith(new File(['x'], 'ticket.jpg', { type: 'image/jpeg' }))))
    expect(res.status).toBe(401)
  })

  it('rejects a file that is neither an image nor a PDF', async () => {
    const res = await POST(reqWith(formWith(new File(['x'], 'ticket.txt', { type: 'text/plain' }))))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('PHOTOS OR PDF')
    expect(saveImageUpload).not.toHaveBeenCalled()
  })

  it('rejects an oversized attachment', async () => {
    const file = new File(['x'], 'ticket.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'size', { value: BREACH_ATTACHMENT_MAX_BYTES + 1 })
    const res = await POST(reqWith(formWith(file)))
    expect(res.status).toBe(413)
    expect((await res.json()).error).toContain('TOO LARGE')
  })

  it('rejects an empty request', async () => {
    const res = await POST(reqWith(new FormData()))
    expect(res.status).toBe(400)
  })
})
