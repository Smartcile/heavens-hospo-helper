'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function Home() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
    <div className="min-h-screen bg-black flex flex-col md:flex-row">
      {/* Left — Venue / Worker */}
      <button
        onClick={() => router.push('/w/login')}
        className="group flex-1 flex flex-col items-center justify-center p-8 border-b md:border-b-0 md:border-r border-grey-mid hover:bg-grey-dark transition-colors min-h-[40vh] md:min-h-screen"
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

      {/* Right — Admin login */}
      <div className="flex-1 flex items-center justify-center p-8 min-h-[50vh] md:min-h-screen">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="font-mono text-2xl font-bold uppercase tracking-widest text-white">
              ADMIN PANEL
            </h2>
            <p className="font-mono text-xs text-grey-light mt-1 uppercase tracking-wider">
              SIGN IN TO MANAGE
            </p>
          </div>

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
          </form>

          <p className="mt-6 font-mono text-xs text-grey-light">
            USE YOUR ADMIN EMAIL + PASSWORD TO ACCESS THE PANEL.
          </p>
        </div>
      </div>
    </div>
  )
}
