import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommentThread, type CommentThreadItem } from '@/components/ui/CommentThread'

const NOTE: CommentThreadItem = {
  id: 'c1',
  body: 'CALLED THE VENUE',
  source: 'MANAGER',
  authorName: 'MORGAN LEE',
  createdAt: '2026-11-12T03:00:00.000Z',
  canDelete: true,
}

function renderThread(over: Partial<Parameters<typeof CommentThread>[0]> = {}) {
  const onAdd = vi.fn(async () => true)
  const onDelete = vi.fn(async () => {})
  render(
    <CommentThread
      comments={[NOTE]}
      loading={false}
      error=""
      canAdd
      maxLength={500}
      onAdd={onAdd}
      onDelete={onDelete}
      {...over}
    />,
  )
  return { onAdd, onDelete }
}

describe('CommentThread', () => {
  it('renders author, source label, body and delete control', () => {
    renderThread()
    expect(screen.getByText('COMMENTS')).toBeTruthy()
    expect(screen.getByText(/MORGAN LEE · MANAGER/)).toBeTruthy()
    expect(screen.getByText('CALLED THE VENUE')).toBeTruthy()
    expect(screen.getByLabelText('Delete comment c1')).toBeTruthy()
  })

  it('adds a comment and clears the draft on success', async () => {
    const { onAdd } = renderThread()
    const input = screen.getByPlaceholderText('ADD A COMMENT')
    fireEvent.change(input, { target: { value: '  CHECK THE TILL  ' } })
    fireEvent.click(screen.getByText('ADD'))

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('CHECK THE TILL'))
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''))
  })

  it('keeps the draft when the add is rejected', async () => {
    const onAdd = vi.fn(async () => false)
    renderThread({ onAdd })
    const input = screen.getByPlaceholderText('ADD A COMMENT')
    fireEvent.change(input, { target: { value: 'TRY AGAIN' } })
    fireEvent.click(screen.getByText('ADD'))

    await waitFor(() => expect(onAdd).toHaveBeenCalled())
    expect((input as HTMLInputElement).value).toBe('TRY AGAIN')
  })

  it('deletes a note', async () => {
    const { onDelete } = renderThread()
    fireEvent.click(screen.getByLabelText('Delete comment c1'))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('c1'))
  })

  it('hides add and delete when the capability is off', () => {
    renderThread({ canAdd: false, comments: [{ ...NOTE, canDelete: false }] })
    expect(screen.queryByPlaceholderText('ADD A COMMENT')).toBeNull()
    expect(screen.queryByLabelText('Delete comment c1')).toBeNull()
  })

  it('shows loading, empty and the legacy reason fallback', () => {
    renderThread({ loading: true, comments: [] })
    expect(screen.getByText('LOADING')).toBeTruthy()

    renderThread({ comments: [], legacyReason: 'OLD REASON' })
    expect(screen.getByText('NO COMMENTS YET.')).toBeTruthy()
    expect(screen.getByText('LEGACY REASON: OLD REASON')).toBeTruthy()
  })
})
