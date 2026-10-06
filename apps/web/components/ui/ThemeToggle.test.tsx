import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
    localStorage.clear()
  })

  it('shows the target (LIGHT MODE) while dark is the active theme', () => {
    const { getByRole } = render(<ThemeToggle />)
    expect(getByRole('button').textContent).toBe('LIGHT MODE')
  })

  it('flips to light: sets data-theme, persists, and relabels', () => {
    const { getByRole } = render(<ThemeToggle />)
    fireEvent.click(getByRole('button'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('hospo-theme')).toBe('light')
    expect(getByRole('button').textContent).toBe('DARK MODE')
  })

  it('flips back to dark when light is active', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const { getByRole } = render(<ThemeToggle />)
    expect(getByRole('button').textContent).toBe('DARK MODE')
    fireEvent.click(getByRole('button'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('hospo-theme')).toBe('dark')
  })
})
