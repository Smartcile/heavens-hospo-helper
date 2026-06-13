'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'

interface Venue {
  id: string
  name: string
  loadedRosterUrl: string | null
  googleCalendarUrl: string | null
  externalRefreshMinutes: number
}

const REFRESH_OPTIONS = [
  { value: '0', label: 'MANUAL ONLY' },
  { value: '5', label: 'EVERY 5 MIN' },
  { value: '15', label: 'EVERY 15 MIN' },
  { value: '30', label: 'EVERY 30 MIN' },
  { value: '60', label: 'EVERY 60 MIN' },
]

export function SettingsClient({
  staffId,
  role,
  sessionVenueId,
}: {
  staffId: string
  role: string
  sessionVenueId: string
}) {
  // Change password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMessage, setPwMessage] = useState('')
  const [pwError, setPwError] = useState('')

  // Change PIN
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [pinMessage, setPinMessage] = useState('')
  const [pinError, setPinError] = useState('')

  // Integrations
  const [venues, setVenues] = useState<Venue[]>([])
  const [venueId, setVenueId] = useState(sessionVenueId)
  const [loadedUrl, setLoadedUrl] = useState('')
  const [googleUrl, setGoogleUrl] = useState('')
  const [refresh, setRefresh] = useState('0')
  const [intSaving, setIntSaving] = useState(false)
  const [intMessage, setIntMessage] = useState('')

  useEffect(() => {
    fetch('/api/admin/venues').then((r) => r.json()).then((data: Venue[]) => {
      setVenues(data)
      const v = data.find((x) => x.id === (role === 'ADMIN' ? data[0]?.id : sessionVenueId)) ?? data[0]
      if (v) applyVenue(v)
    })
  }, [])

  function applyVenue(v: Venue) {
    setVenueId(v.id)
    setLoadedUrl(v.loadedRosterUrl ?? '')
    setGoogleUrl(v.googleCalendarUrl ?? '')
    setRefresh(String(v.externalRefreshMinutes ?? 0))
  }

  function onPickVenue(id: string) {
    const v = venues.find((x) => x.id === id)
    if (v) applyVenue(v)
  }

  async function handleChangePassword() {
    if (!newPassword || !confirmPassword) { setPwError('ALL FIELDS REQUIRED'); return }
    if (newPassword.length < 8) { setPwError('PASSWORD MUST BE AT LEAST 8 CHARACTERS'); return }
    if (newPassword !== confirmPassword) { setPwError('PASSWORDS DO NOT MATCH'); return }
    setPwSaving(true); setPwError(''); setPwMessage('')
    const r = await fetch(`/api/admin/staff/${staffId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: newPassword }),
    })
    setPwSaving(false)
    if (r.ok) { setPwMessage('PASSWORD UPDATED'); setNewPassword(''); setConfirmPassword('') }
    else { const d = await r.json(); setPwError(d.error ?? 'UPDATE FAILED') }
  }

  async function handleChangePin() {
    if (!newPin || !confirmPin) { setPinError('ALL FIELDS REQUIRED'); return }
    if (!/^\d{2,4}$/.test(newPin)) { setPinError('PIN MUST BE 2-4 DIGITS'); return }
    if (newPin !== confirmPin) { setPinError('PINS DO NOT MATCH'); return }
    setPinSaving(true); setPinError(''); setPinMessage('')
    const r = await fetch(`/api/admin/staff/${staffId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: newPin }),
    })
    setPinSaving(false)
    if (r.ok) { setPinMessage('PIN UPDATED'); setNewPin(''); setConfirmPin('') }
    else { const d = await r.json(); setPinError(d.error ?? 'UPDATE FAILED') }
  }

  async function saveIntegrations() {
    if (!venueId) return
    setIntSaving(true); setIntMessage('')
    const r = await fetch(`/api/admin/venues/${venueId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loadedRosterUrl: loadedUrl, googleCalendarUrl: googleUrl, externalRefreshMinutes: Number(refresh) }),
    })
    setIntSaving(false)
    if (r.ok) {
      const v = await r.json()
      setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...v } : x)))
      setIntMessage('SAVED')
    } else setIntMessage('SAVE FAILED')
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="font-mono text-xl font-bold uppercase tracking-widest">SETTINGS</h1>

      {/* Integrations */}
      <div className="max-w-2xl border-l-4 border-l-white pl-4">
        <h2 className="font-mono text-sm uppercase tracking-widest text-white mb-1">INTEGRATIONS</h2>
        <p className="font-mono text-xs text-grey-light mb-3">
          PASTE A LIVE LINK AND IT SHOWS ON THE CALENDAR PAGE. NOTHING IS COPIED IN — IT&apos;S THE LIVE SOURCE, SO NO DOUBLE-UPS.
        </p>
        <div className="space-y-3">
          {role === 'ADMIN' && venues.length > 1 && (
            <Select label="Venue" value={venueId} onChange={(e) => onPickVenue(e.target.value)} options={venues.map((v) => ({ value: v.id, label: v.name }))} />
          )}
          <Textarea label="Loaded roster — public link" value={loadedUrl} onChange={(e) => setLoadedUrl(e.target.value)} placeholder="https://loadedhub.com/App/PublicRoster#/roster/..." />
          <Textarea label="Google Calendar — embed link" value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/embed?..." />
          <Select label="Auto-refresh interval" value={refresh} onChange={(e) => setRefresh(e.target.value)} options={REFRESH_OPTIONS} />
          {intMessage && <p className={`font-mono text-xs ${intMessage === 'SAVED' ? 'text-success' : 'text-danger'}`}>{intMessage}</p>}
          <Button onClick={saveIntegrations} loading={intSaving} size="sm">SAVE INTEGRATIONS</Button>
        </div>
      </div>

      {/* NZ break entitlements reference */}
      <div className="max-w-2xl border-l-4 border-l-grey-mid pl-4">
        <h2 className="font-mono text-sm uppercase tracking-widest text-white mb-1">NZ BREAK ENTITLEMENTS</h2>
        <p className="font-mono text-xs text-grey-light mb-3">
          SHOWN AUTOMATICALLY ON EACH ROSTERED SHIFT (GUIDE ONLY — PER EMPLOYMENT RELATIONS ACT 2000).
        </p>
        <table className="w-full border border-grey-mid">
          <thead>
            <tr className="border-b border-grey-mid">
              {['SHIFT LENGTH', 'PAID 10-MIN REST', 'UNPAID 30-MIN MEAL'].map((h) => (
                <th key={h} className="px-3 py-2 font-mono text-xs uppercase text-grey-light text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-grey-mid font-mono text-xs text-white">
            <tr><td className="px-3 py-1.5">2–4 HOURS</td><td className="px-3 py-1.5">1</td><td className="px-3 py-1.5">0</td></tr>
            <tr><td className="px-3 py-1.5">4–6 HOURS</td><td className="px-3 py-1.5">1</td><td className="px-3 py-1.5">1</td></tr>
            <tr><td className="px-3 py-1.5">6–8 HOURS</td><td className="px-3 py-1.5">2</td><td className="px-3 py-1.5">1</td></tr>
            <tr><td className="px-3 py-1.5">OVER 8 HOURS</td><td className="px-3 py-1.5" colSpan={2}>ENTITLEMENTS REPEAT FOR EACH FURTHER PERIOD</td></tr>
          </tbody>
        </table>
      </div>

      <div className="max-w-md grid md:grid-cols-2 gap-6">
        {/* Change password */}
        <div className="border-l-4 border-l-grey-mid pl-4">
          <h2 className="font-mono text-sm uppercase tracking-widest text-white mb-1">CHANGE PASSWORD</h2>
          <p className="font-mono text-xs text-grey-light mb-3">FOR YOUR ADMIN WEB LOGIN.</p>
          <div className="space-y-3">
            <Input label="New Password (min 8)" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            <Input label="Confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            {pwError && <p className="font-mono text-xs text-danger">{pwError}</p>}
            {pwMessage && <p className="font-mono text-xs text-success">{pwMessage}</p>}
            <Button onClick={handleChangePassword} loading={pwSaving} size="sm">UPDATE PASSWORD</Button>
          </div>
        </div>

        {/* Change PIN */}
        <div className="border-l-4 border-l-grey-mid pl-4">
          <h2 className="font-mono text-sm uppercase tracking-widest text-white mb-1">CHANGE FLOOR PIN</h2>
          <p className="font-mono text-xs text-grey-light mb-3">FOR QR + NUMPAD WORKER LOGIN.</p>
          <div className="space-y-3">
            <Input label="New PIN (2-4 digits)" type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="••••" maxLength={4} />
            <Input label="Confirm" type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} placeholder="••••" maxLength={4} />
            {pinError && <p className="font-mono text-xs text-danger">{pinError}</p>}
            {pinMessage && <p className="font-mono text-xs text-success">{pinMessage}</p>}
            <Button onClick={handleChangePin} loading={pinSaving} size="sm" variant="ghost">UPDATE PIN</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
