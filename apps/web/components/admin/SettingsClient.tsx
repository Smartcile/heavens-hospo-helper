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
  icalFeedUrl: string | null
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
  defaultVenueId,
}: {
  staffId: string
  role: string
  sessionVenueId: string
  defaultVenueId: string | null | undefined
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

  // Default venue
  const [defVenueId, setDefVenueId] = useState(defaultVenueId ?? '')
  const [defSaving, setDefSaving] = useState(false)
  const [defMessage, setDefMessage] = useState('')

  // Integrations
  const [venues, setVenues] = useState<Venue[]>([])
  const [venueId, setVenueId] = useState(sessionVenueId)
  const [loadedUrl, setLoadedUrl] = useState('')
  const [googleUrl, setGoogleUrl] = useState('')
  const [icalUrl, setIcalUrl] = useState('')
  const [refresh, setRefresh] = useState('0')
  const [intSaving, setIntSaving] = useState(false)
  const [intMessage, setIntMessage] = useState('')

  // WooCommerce
  const [wcStoreUrl, setWcStoreUrl] = useState('')
  const [wcConsumerKey, setWcConsumerKey] = useState('')
  const [wcConsumerSecret, setWcConsumerSecret] = useState('')
  const [wcWebhookSecret, setWcWebhookSecret] = useState('')
  const [wcActive, setWcActive] = useState(false)
  const [wcSaving, setWcSaving] = useState(false)
  const [wcMessage, setWcMessage] = useState('')
  const [wcLastSync, setWcLastSync] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/venues').then((r) => r.json()).then((data: Venue[]) => {
      setVenues(data)
      const v = data.find((x) => x.id === (role === 'ADMIN' ? data[0]?.id : sessionVenueId)) ?? data[0]
      if (v) applyVenue(v)
    })
  }, [])

  useEffect(() => {
    fetch('/api/admin/settings/woocommerce')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setWcStoreUrl(d.wcStoreUrl ?? '')
          setWcConsumerKey(d.wcConsumerKey ?? '')
          setWcConsumerSecret(d.wcConsumerSecret ?? '')
          setWcWebhookSecret(d.wcWebhookSecret ?? '')
          setWcActive(d.wcActive ?? false)
          setWcLastSync(d.lastSyncAt ?? null)
        }
      })
  }, [])

  function applyVenue(v: Venue) {
    setVenueId(v.id)
    setLoadedUrl(v.loadedRosterUrl ?? '')
    setGoogleUrl(v.googleCalendarUrl ?? '')
    setIcalUrl(v.icalFeedUrl ?? '')
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
      body: JSON.stringify({ loadedRosterUrl: loadedUrl, googleCalendarUrl: googleUrl, icalFeedUrl: icalUrl, externalRefreshMinutes: Number(refresh) }),
    })
    setIntSaving(false)
    if (r.ok) {
      const v = await r.json()
      setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...v } : x)))
      setIntMessage('SAVED')
    } else setIntMessage('SAVE FAILED')
  }

  async function saveWooCommerce() {
    setWcSaving(true); setWcMessage('')
    const r = await fetch('/api/admin/settings/woocommerce', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wcStoreUrl: wcStoreUrl,
        wcConsumerKey: wcConsumerKey,
        wcConsumerSecret: wcConsumerSecret,
        wcWebhookSecret: wcWebhookSecret,
        wcActive,
      }),
    })
    setWcSaving(false)
    if (r.ok) {
      const d = await r.json()
      setWcConsumerKey(d.wcConsumerKey ?? '')
      setWcConsumerSecret(d.wcConsumerSecret ?? '')
      setWcWebhookSecret(d.wcWebhookSecret ?? '')
      setWcLastSync(d.lastSyncAt ?? null)
      setWcMessage('SAVED')
    } else {
      setWcMessage('SAVE FAILED')
    }
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="font-mono text-xl font-bold uppercase tracking-widest">SETTINGS</h1>

      {/* Integrations */}
      <div className="max-w-2xl border-l-4 border-l-white pl-4">
        <h2 className="font-mono text-sm uppercase tracking-widest text-white mb-1">INTEGRATIONS</h2>
        <p className="font-mono text-xs text-grey-light mb-3">
          GOOGLE CALENDAR + ANY ICAL FEED ARE IMPORTED ONTO THE PLANNER (RE-SYNCED ON THE INTERVAL — CHANGED EVENTS UPDATE, REMOVED ONES DROP OFF, NO DOUBLE-UPS). THE LOADED LINK STAYS A LIVE EMBED TAB.
        </p>
        <div className="space-y-3">
          {role === 'ADMIN' && venues.length > 1 && (
            <Select label="Venue" value={venueId} onChange={(e) => onPickVenue(e.target.value)} options={venues.map((v) => ({ value: v.id, label: v.name }))} />
          )}
          <Textarea label="Google Calendar — embed link (shown as EVENTS tab + imported to planner)" value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/embed?src=..." />
          <Textarea label="iCal feed (.ics) — imported to planner (e.g. a roster 'subscribe to calendar' link)" value={icalUrl} onChange={(e) => setIcalUrl(e.target.value)} placeholder="https://…/basic.ics  or  webcal://…" />
          <Textarea label="Loaded roster — public link (live embed tab only)" value={loadedUrl} onChange={(e) => setLoadedUrl(e.target.value)} placeholder="https://loadedhub.com/App/PublicRoster#/roster/..." />
          <Select label="Auto-refresh / re-sync interval" value={refresh} onChange={(e) => setRefresh(e.target.value)} options={REFRESH_OPTIONS} />
          {intMessage && <p className={`font-mono text-xs ${intMessage === 'SAVED' ? 'text-success' : 'text-danger'}`}>{intMessage}</p>}
          <Button onClick={saveIntegrations} loading={intSaving} size="sm">SAVE INTEGRATIONS</Button>
        </div>
      </div>

      {/* WooCommerce */}
      <div className="max-w-2xl border-l-4 border-l-grey-mid pl-4">
        <h2 className="font-mono text-sm uppercase tracking-widest text-white mb-1">WOOCOMMERCE</h2>
        <p className="font-mono text-xs text-grey-light mb-3">
          CONNECT YOUR WOOCOMMERCE STORE TO SYNC ORDERS AND AUTO-ALLOCATE INVENTORY. THE WEBHOOK SECRET IS USED TO VERIFY INCOMING ORDER NOTIFICATIONS.
        </p>
        <div className="space-y-3">
          <Input label="STORE URL" value={wcStoreUrl} onChange={(e) => setWcStoreUrl(e.target.value)} placeholder="https://yourshop.co.nz" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="CONSUMER KEY" type="password" value={wcConsumerKey} onChange={(e) => setWcConsumerKey(e.target.value)} placeholder={wcConsumerKey ? '••••••••' : 'ck_...'} autoComplete="off" />
            <Input label="CONSUMER SECRET" type="password" value={wcConsumerSecret} onChange={(e) => setWcConsumerSecret(e.target.value)} placeholder={wcConsumerSecret ? '••••••••' : 'cs_...'} autoComplete="off" />
          </div>
          <Input label="WEBHOOK SECRET" type="password" value={wcWebhookSecret} onChange={(e) => setWcWebhookSecret(e.target.value)} placeholder={wcWebhookSecret ? '••••••••' : 'whsec_...'} autoComplete="off" />
          <div className="flex items-center gap-3">
            <button
              onClick={() => setWcActive(!wcActive)}
              className={`font-mono text-xs uppercase px-3 py-1.5 border ${wcActive ? 'border-success text-success' : 'border-grey-mid text-grey-light'}`}
            >
              {wcActive ? 'ACTIVE' : 'INACTIVE'}
            </button>
            {wcLastSync && (
              <span className="font-mono text-[10px] text-grey-light">
                LAST SYNC: {new Date(wcLastSync).toLocaleString()}
              </span>
            )}
          </div>
          {wcMessage && <p className={`font-mono text-xs ${wcMessage === 'SAVED' ? 'text-success' : 'text-danger'}`}>{wcMessage}</p>}
          <Button onClick={saveWooCommerce} loading={wcSaving} size="sm">SAVE WOOCOMMERCE</Button>
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
        {/* Default venue (admin only) */}
        {role === 'ADMIN' && (
          <div className="border-l-4 border-l-grey-mid pl-4">
            <h2 className="font-mono text-sm uppercase tracking-widest text-white mb-1">DEFAULT VENUE</h2>
            <p className="font-mono text-xs text-grey-light mb-3">AUTO-SELECT THIS VENUE IN ALL ADMIN MODULES.</p>
            <div className="space-y-3">
              <Select
                value={defVenueId}
                onChange={(e) => { setDefVenueId(e.target.value); setDefMessage('') }}
                options={[{ value: '', label: 'NONE (ALL VENUES)' }, ...venues.map((v) => ({ value: v.id, label: v.name }))]}
              />
              {defMessage && <p className="font-mono text-xs text-success">{defMessage}</p>}
              <Button
                size="sm"
                loading={defSaving}
                onClick={async () => {
                  setDefSaving(true); setDefMessage('')
                  const r = await fetch(`/api/admin/staff/${staffId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ defaultVenueId: defVenueId || null }),
                  })
                  setDefSaving(false)
                  if (r.ok) setDefMessage('SAVED — SIGN OUT & BACK IN TO APPLY.')
                }}
              >
                SAVE DEFAULT
              </Button>
            </div>
          </div>
        )}
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
