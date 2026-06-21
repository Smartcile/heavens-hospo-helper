'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'

interface Venue { id: string; name: string }

function PinPad({ venueId }: { venueId: string }) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleDigit(d: string) {
    if (pin.length >= 4) return
    setPin((p) => p + d)
    setError('')
  }

  function handleBack() {
    setPin((p) => p.slice(0, -1))
    setError('')
  }

  function handleClear() {
    setPin('')
    setError('')
  }

  async function handleSubmit() {
    if (pin.length < 2) { setError('PIN TOO SHORT'); return }
    setLoading(true)
    setError('')

    const r = await fetch('/api/worker/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, pin }),
    })

    const data = await r.json()
    setLoading(false)

    if (!r.ok) {
      setError(data.error ?? 'LOGIN FAILED')
      setPin('')
      return
    }

    router.push('/w/dashboard')
    router.refresh()
  }

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-8">
        <div className="text-center">
          <h1 className="font-mono text-2xl font-bold uppercase tracking-widest text-white">
            HOSPO OPS
          </h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase tracking-wider">
            ENTER YOUR PIN TO CONTINUE
          </p>
        </div>

        {/* PIN display */}
        <div className="flex justify-center gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 border-2 transition-colors ${
                i < pin.length ? 'bg-white border-white' : 'bg-transparent border-grey-mid'
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="border-l-4 border-l-danger pl-3 py-1 text-center">
            <p className="font-mono text-xs text-danger">{error}</p>
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((key, i) => {
            if (key === '') return <div key={i} />
            if (key === '⌫') {
              return (
                <button
                  key={i}
                  onClick={handleBack}
                  className="h-16 font-mono text-2xl text-grey-light border border-grey-mid bg-transparent hover:border-white hover:text-white transition-colors active:bg-grey-mid"
                >
                  {key}
                </button>
              )
            }
            return (
              <button
                key={i}
                onClick={() => handleDigit(key)}
                className="h-16 font-mono text-2xl font-bold text-white border border-grey-mid bg-transparent hover:bg-grey-dark hover:border-white transition-colors active:bg-grey-mid"
              >
                {key}
              </button>
            )
          })}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || pin.length < 2}
          className="w-full h-14 font-mono text-sm font-bold uppercase tracking-widest bg-white text-black border border-white hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'CHECKING_' : 'SIGN IN'}
        </button>

        <button
          onClick={handleClear}
          className="w-full font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
        >
          CLEAR
        </button>

        <div className="text-center">
          <button
            onClick={() => router.push('/w/login')}
            className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
          >
            ← DIFFERENT VENUE
          </button>
        </div>
      </div>
    </div>
  )
}

function VenuePicker() {
  const router = useRouter()
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/venues')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { setVenues(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-mono text-2xl font-bold uppercase tracking-widest text-white">
            HOSPO OPS
          </h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase tracking-wider">
            SELECT YOUR VENUE
          </p>
        </div>

        {venues.length === 0 && (
          <p className="font-mono text-xs text-grey-light text-center">NO VENUES AVAILABLE.</p>
        )}

        <div className="space-y-3">
          {venues.map((v) => (
            <button
              key={v.id}
              onClick={() => router.push(`/w/login?venue=${v.id}`)}
              className="w-full bg-grey-dark border border-grey-mid p-6 text-left hover:border-white transition-colors active:bg-black flex flex-col gap-1"
            >
              <span className="font-mono text-lg font-bold uppercase text-white">{v.name}</span>
              <span className="font-mono text-xs text-grey-light uppercase">TAP TO ENTER PIN</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function LoginContent() {
  const searchParams = useSearchParams()
  const venueId = searchParams.get('venue')

  if (venueId) {
    return <PinPad venueId={venueId} />
  }

  return <VenuePicker />
}

export default function WorkerLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
