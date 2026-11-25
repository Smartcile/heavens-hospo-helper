import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/components/ui/MultiImagePicker', () => ({
  MultiImagePicker: ({ value, onChange }: { value: string[]; onChange: (urls: string[]) => void }) => (
    <button type="button" onClick={() => onChange([...(value ?? []), '/api/upload/photo.jpg'])}>
      ADD PHOTO
    </button>
  ),
}))

import { TaskThread } from '@/components/tasks/TaskThread'

function json(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

const COMMENTS = [
  {
    id: 'c1', body: 'FIRST MESSAGE', imageUrls: ['/api/upload/a.jpg'], authorId: 's1',
    authorName: 'ANN B', createdAt: '2026-11-25T09:00:00.000Z', canDelete: false,
  },
  {
    id: 'c2', body: 'SECOND MESSAGE', imageUrls: [], authorId: 'a1',
    authorName: 'ADMIN', createdAt: '2026-11-25T10:00:00.000Z', canDelete: false,
  },
]

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/sign-off')) {
      const body = JSON.parse(String(init?.body))
      return json({ closed: body.closed })
    }
    if (u.endsWith('/comments') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      return json({
        comment: {
          id: 'c3', body: body.body, imageUrls: body.imageUrls, authorId: 's1',
          authorName: 'ANN B', createdAt: '2026-11-25T11:00:00.000Z', canDelete: true,
        },
      })
    }
    return json({ comments: COMMENTS, canAdd: true, canDeleteAny: false, canSignOff: true, threadClosedAt: null })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TaskThread', () => {
  it('renders comments oldest-first with photos', async () => {
    render(<TaskThread taskId="t1" basePath="/api/worker/tasks" uploadEndpoint="/api/worker/upload" />)

    await waitFor(() => expect(screen.getByText('FIRST MESSAGE')).toBeDefined())
    const rows = screen.getAllByTestId('thread-comment')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('FIRST MESSAGE')
    expect(rows[1].textContent).toContain('SECOND MESSAGE')
    expect(screen.getByAltText('THREAD PHOTO')).toBeDefined()
  })

  it('posts a comment with a photo', async () => {
    render(<TaskThread taskId="t1" basePath="/api/worker/tasks" uploadEndpoint="/api/worker/upload" />)
    await waitFor(() => expect(screen.getByPlaceholderText('ADD A COMMENT…')).toBeDefined())

    fireEvent.change(screen.getByPlaceholderText('ADD A COMMENT…'), { target: { value: 'HELLO TEAM' } })
    fireEvent.click(screen.getByText('ADD PHOTO'))
    fireEvent.click(screen.getByText('POST COMMENT'))

    await waitFor(() => expect(screen.getByText('HELLO TEAM')).toBeDefined())
    const post = vi.mocked(global.fetch).mock.calls.find(
      ([, init]) => init?.method === 'POST' && String(init.body).includes('HELLO TEAM'),
    )
    expect(post).toBeDefined()
    expect(JSON.parse(String(post![1]!.body))).toEqual({
      body: 'HELLO TEAM',
      imageUrls: ['/api/upload/photo.jpg'],
    })
  })

  it('signs the thread off and reopens it', async () => {
    render(<TaskThread taskId="t1" basePath="/api/admin/tasks" uploadEndpoint="/api/admin/upload" />)
    await waitFor(() => expect(screen.getByText('CLOSE THREAD')).toBeDefined())

    fireEvent.click(screen.getByText('CLOSE THREAD'))
    await waitFor(() => expect(screen.getByText('REOPEN')).toBeDefined())
    expect(screen.getByText('SIGNED OFF')).toBeDefined()

    fireEvent.click(screen.getByText('REOPEN'))
    await waitFor(() => expect(screen.getByText('CLOSE THREAD')).toBeDefined())
    expect(screen.getByText('OPEN')).toBeDefined()
  })
})
