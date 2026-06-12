'use client'

import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'font-mono font-semibold uppercase tracking-wider transition-colors inline-flex items-center gap-2'

  const variants = {
    primary: 'bg-white text-black border border-white hover:bg-accent hover:border-accent',
    ghost: 'bg-transparent text-white border border-grey-mid hover:border-white',
    danger: 'bg-transparent text-danger border border-danger hover:bg-danger hover:text-black',
  }

  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3',
  }

  return (
    <button
      className={cn(base, variants[variant], sizes[size], disabled || loading ? 'opacity-50 cursor-not-allowed' : '', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="loading-cursor">LOADING</span> : children}
    </button>
  )
}
