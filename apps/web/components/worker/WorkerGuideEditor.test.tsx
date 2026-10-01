import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { WorkerGuideEditor } from '@/components/worker/WorkerGuideEditor'

function mockFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    const json = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })
    const u = String(url)
    if (u.startsWith('/api/worker/guides/options')) {
      return json({ canEdit: true, canPublish: true, departments: [{ id: 'd1', name: 'BAR' }], tasks: [{ id: 't1', title: 'CLEAN THE MACHINE', departmentId: null }] })
    }
    if (u.endsWith('/api/worker/guides') && init?.method === 'POST') {
      return json({ id: 'g9' })
    }
    return json(null)
  }) as unknown as typeof fetch
}

describe('WorkerGuideEditor', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('creates a new guide with a type, body and linked task', async () => {
    const spy = mockFetch()
    globalThis.fetch = spy
    const onSaved = vi.fn()

    render(<WorkerGuideEditor guideId={null} canPublish onClose={() => {}} onSaved={onSaved} />)

    expect(await screen.findByText('NEW GUIDE')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('FOOD SAFETY BASICS'), { target: { value: 'how to clean the machine' } })
    // Link a task (toggle the row).
    fireEvent.click(await screen.findByText('CLEAN THE MACHINE'))
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.title).toBe('how to clean the machine')
      expect(body.guideType).toBe('HOW_TO')
      expect(body.taskGuides).toEqual([{ taskId: 't1', isRequiredForCompetency: false }])
    })
    expect(onSaved).toHaveBeenCalled()
  })
})
