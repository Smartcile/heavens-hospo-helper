import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VideoPicker } from './VideoPicker'

describe('VideoPicker', () => {
  it('previews the uploaded clip', () => {
    render(<VideoPicker value="/api/upload/v.mp4" onChange={() => {}} />)
    expect(document.querySelector('video')?.getAttribute('src')).toBe('/api/upload/v.mp4')
  })

  it('clears the clip', () => {
    const onChange = vi.fn()
    render(<VideoPicker value="/api/upload/v.mp4" onChange={onChange} />)
    fireEvent.click(screen.getByText('REMOVE'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('shows no preview when empty', () => {
    render(<VideoPicker value={null} onChange={() => {}} />)
    expect(document.querySelector('video')).toBeNull()
  })
})
