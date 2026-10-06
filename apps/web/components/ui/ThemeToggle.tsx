'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type Theme = 'dark' | 'light'

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

/**
 * Flips the app between the dark (default) and light themes by setting
 * `data-theme` on <html>. The globals.css token overrides do the rest.
 * The initial value is applied before paint by the inline script in layout.tsx
 * (no flash); this component only reads and mutates it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(readTheme())
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('hospo-theme', next)
    } catch {
      /* private mode — non-fatal */
    }
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', next === 'light' ? '#FFFFFF' : '#0A0A0A')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className={cn(
        'font-mono text-xs uppercase text-grey-light hover:text-white transition-colors tracking-wider',
        className
      )}
    >
      {theme === 'dark' ? 'LIGHT MODE' : 'DARK MODE'}
    </button>
  )
}
