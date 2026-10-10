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

      {/* Admin login lives behind a discreet button */}
      <div className="border-t border-grey-mid p-4 flex justify-center">
        <button
          onClick={() => setAdminOpen(true)}
          className="font-mono text-xs uppercase tracking-widest text-grey-light hover:text-white transition-colors"
        >
          ADMIN LOGIN
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
