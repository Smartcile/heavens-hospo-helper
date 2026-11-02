import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RichTextEditor } from '@/components/ui/RichTextEditor'

describe('RichTextEditor', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the formatting toolbar', () => {
    render(<RichTextEditor value="" onChange={() => {}} />)
    for (const label of ['H1', 'H2', 'H3', 'P', 'B', 'I', 'U', '• LIST', '1. LIST', 'CLEAR']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('seeds the initial HTML into the editable area', () => {
    const { container } = render(<RichTextEditor value="<p>Hello</p>" onChange={() => {}} />)
    const editable = container.querySelector('[contenteditable]') as HTMLElement
    expect(editable.innerHTML).toBe('<p>Hello</p>')
  })

  it('emits the raw HTML on input', () => {
    const onChange = vi.fn()
    const { container } = render(<RichTextEditor value="" onChange={onChange} />)
    const editable = container.querySelector('[contenteditable]') as HTMLElement
    editable.innerHTML = '<p>Hi</p>'
    fireEvent.input(editable)
    expect(onChange).toHaveBeenCalledWith('<p>Hi</p>')
  })

  it('runs a formatting command via execCommand on a toolbar click', () => {
    const exec = vi.fn()
    ;(document as unknown as { execCommand: typeof exec }).execCommand = exec
    render(<RichTextEditor value="" onChange={() => {}} />)
    fireEvent.click(screen.getByText('H2'))
    expect(exec).toHaveBeenCalledWith('formatBlock', false, 'h2')
  })
})
