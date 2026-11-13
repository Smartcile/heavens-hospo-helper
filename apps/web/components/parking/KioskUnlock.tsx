'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function KioskUnlock({ message }: { message?: string }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/public/parking/kiosk/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'COULD NOT UNLOCK')
        return
      }
      router.refresh()
    } catch {
      setError('COULD NOT CONNECT — TRY AGAIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full w-full flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="font-mono text-2xl font-bold uppercase tracking-widest text-white">
            STAFF SETUP
          </h1>
          <p className="font-mono text-sm text-grey-light">
            ENTER THE KIOSK CODE FROM SETTINGS → FTP.
          </p>
        </div>

        {message && (
          <p className="border border-warning/50 bg-warning/10 p-3 text-center font-mono text-xs uppercase text-warning">
            {message}
          </p>
        )}

        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="KIOSK CODE"
          className="w-full border border-grey-mid bg-black px-4 py-5 text-center font-mono text-3xl uppercase tracking-[0.4em] text-white outline-none placeholder:text-lg placeholder:tracking-widest placeholder:text-grey-light focus:border-white"
        />

        {error && (
          <p className="text-center font-mono text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || code.trim().length < 6}
          className="w-full border border-white bg-white py-5 font-mono text-lg font-bold uppercase tracking-widest text-black disabled:opacity-40"
        >
          {loading ? 'UNLOCKING…' : 'UNLOCK KIOSK'}
        </button>
      </form>
    </div>
  )
}
