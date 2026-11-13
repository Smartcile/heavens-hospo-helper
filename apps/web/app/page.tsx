'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

export default function Home() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('INVALID CREDENTIALS')
    } else {
      router.push('/admin')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Worker login — the only visible entry */}
      <button
        onClick={() => router.push('/w/login')}
        className="group flex-1 flex flex-col items-center justify-center p-8 hover:bg-grey-dark transition-colors"
      >
        <h2 className="font-mono text-3xl font-bold uppercase tracking-widest text-white">
          VENUE
        </h2>
        <p className="font-mono text-xs text-grey-light mt-2 uppercase tracking-wider">
          WORKER LOGIN
        </p>
        <span className="mt-8 font-mono text-xs uppercase tracking-widest text-grey-light group-hover:text-white transition-colors">
          ENTER →
        </span>
      </button>

      {/* Admin login lives behind a discreet full-width button. The small car
          icon opens the customer parking kiosk (Settings → FTP controls it). */}
      <div className="flex items-stretch border-t border-grey-mid">
        <button
          onClick={() => setAdminOpen(true)}
          className="flex-1 min-h-[48px] flex items-center justify-center px-4 pt-4 pb-safe font-mono text-xs uppercase tracking-widest text-grey-light hover:text-white transition-colors"
        >
          <span className="pb-4">ADMIN LOGIN</span>
        </button>
        <button
          onClick={() => router.push('/park')}
          aria-label="Open the car park kiosk"
          title="Car park kiosk"
          className="shrink-0 w-16 min-h-[48px] flex items-center justify-center border-l border-grey-mid pb-safe text-grey-light hover:text-white transition-colors"
        >
          <svg className="w-6 h-6 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="square"
              strokeWidth={1.5}
              d="M4 14l2-5.5A2 2 0 018 7h8a2 2 0 011.9 1.5L20 14M4 14h16M4 14v4h2v-2h12v2h2v-4M7.5 16h.01M16.5 16h.01"
            />
          </svg>
        </button>
      </div>

      <Modal isOpen={adminOpen} onClose={() => setAdminOpen(false)} title="ADMIN LOGIN" size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@venue.com"
            required
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />

          {error && (
            <div className="border-l-4 border-l-danger pl-3 py-1">
              <p className="font-mono text-xs text-danger">{error}</p>
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full justify-center">
            SIGN IN
          </Button>
          <p className="font-mono text-xs text-grey-light">
            USE YOUR ADMIN EMAIL + PASSWORD TO ACCESS THE PANEL.
          </p>
        </form>
      </Modal>
    </div>
  )
}
