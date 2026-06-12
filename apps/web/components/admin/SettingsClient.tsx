'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function SettingsClient({ staffId, role }: { staffId: string; role: string }) {
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleChangePin() {
    if (!newPin || !confirmPin) { setError('ALL FIELDS REQUIRED'); return }
    if (!/^\d{2,4}$/.test(newPin)) { setError('PIN MUST BE 2-4 DIGITS'); return }
    if (newPin !== confirmPin) { setError('PINS DO NOT MATCH'); return }

    setSaving(true)
    setError('')
    setMessage('')

    const r = await fetch(`/api/admin/staff/${staffId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: newPin }),
    })

    setSaving(false)
    if (r.ok) {
      setMessage('PIN UPDATED SUCCESSFULLY')
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
    } else {
      const data = await r.json()
      setError(data.error ?? 'UPDATE FAILED')
    }
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="font-mono text-xl font-bold uppercase tracking-widest">SETTINGS</h1>

      <div className="max-w-md space-y-4">
        <div className="border-l-4 border-l-white pl-4">
          <h2 className="font-mono text-sm uppercase tracking-widest text-white mb-3">CHANGE PIN</h2>
          <div className="space-y-3">
            <Input
              label="New PIN (2-4 digits)"
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="••••"
              maxLength={4}
            />
            <Input
              label="Confirm New PIN"
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="••••"
              maxLength={4}
            />
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
            {message && <p className="font-mono text-xs text-success">{message}</p>}
            <Button onClick={handleChangePin} loading={saving} size="sm">
              UPDATE PIN
            </Button>
          </div>
        </div>

        <div className="border-l-4 border-l-grey-mid pl-4 opacity-50">
          <h2 className="font-mono text-sm uppercase tracking-widest text-grey-light mb-1">COMING SOON</h2>
          <ul className="font-mono text-xs text-grey-light space-y-1">
            <li>• GLOBAL TIMEZONE DEFAULT</li>
            <li>• APP NAME (WHITE-LABEL)</li>
            <li>• SWIFTPOS SYNC CONFIGURATION</li>
            <li>• EMAIL NOTIFICATIONS</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
