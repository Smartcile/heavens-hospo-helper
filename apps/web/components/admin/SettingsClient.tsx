'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function SettingsClient({ staffId, role }: { staffId: string; role: string }) {
  // Change password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMessage, setPwMessage] = useState('')
  const [pwError, setPwError] = useState('')

  // Change PIN (floor login)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [pinMessage, setPinMessage] = useState('')
  const [pinError, setPinError] = useState('')

  async function handleChangePassword() {
    if (!newPassword || !confirmPassword) { setPwError('ALL FIELDS REQUIRED'); return }
    if (newPassword.length < 8) { setPwError('PASSWORD MUST BE AT LEAST 8 CHARACTERS'); return }
    if (newPassword !== confirmPassword) { setPwError('PASSWORDS DO NOT MATCH'); return }

    setPwSaving(true)
    setPwError('')
    setPwMessage('')

    const r = await fetch(`/api/admin/staff/${staffId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    })

    setPwSaving(false)
    if (r.ok) {
      setPwMessage('PASSWORD UPDATED SUCCESSFULLY')
      setNewPassword('')
      setConfirmPassword('')
    } else {
      const data = await r.json()
      setPwError(data.error ?? 'UPDATE FAILED')
    }
  }

  async function handleChangePin() {
    if (!newPin || !confirmPin) { setPinError('ALL FIELDS REQUIRED'); return }
    if (!/^\d{2,4}$/.test(newPin)) { setPinError('PIN MUST BE 2-4 DIGITS'); return }
    if (newPin !== confirmPin) { setPinError('PINS DO NOT MATCH'); return }

    setPinSaving(true)
    setPinError('')
    setPinMessage('')

    const r = await fetch(`/api/admin/staff/${staffId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: newPin }),
    })

    setPinSaving(false)
    if (r.ok) {
      setPinMessage('PIN UPDATED SUCCESSFULLY')
      setNewPin('')
      setConfirmPin('')
    } else {
      const data = await r.json()
      setPinError(data.error ?? 'UPDATE FAILED')
    }
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="font-mono text-xl font-bold uppercase tracking-widest">SETTINGS</h1>

      <div className="max-w-md space-y-6">
        {/* Change password (web login) */}
        <div className="border-l-4 border-l-white pl-4">
          <h2 className="font-mono text-sm uppercase tracking-widest text-white mb-1">CHANGE PASSWORD</h2>
          <p className="font-mono text-xs text-grey-light mb-3">FOR YOUR ADMIN WEB LOGIN.</p>
          <div className="space-y-3">
            <Input
              label="New Password (min 8 chars)"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {pwError && <p className="font-mono text-xs text-danger">{pwError}</p>}
            {pwMessage && <p className="font-mono text-xs text-success">{pwMessage}</p>}
            <Button onClick={handleChangePassword} loading={pwSaving} size="sm">
              UPDATE PASSWORD
            </Button>
          </div>
        </div>

        {/* Change PIN (floor login) */}
        <div className="border-l-4 border-l-grey-mid pl-4">
          <h2 className="font-mono text-sm uppercase tracking-widest text-white mb-1">CHANGE FLOOR PIN</h2>
          <p className="font-mono text-xs text-grey-light mb-3">FOR QR + NUMPAD WORKER LOGIN (OPTIONAL).</p>
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
            {pinError && <p className="font-mono text-xs text-danger">{pinError}</p>}
            {pinMessage && <p className="font-mono text-xs text-success">{pinMessage}</p>}
            <Button onClick={handleChangePin} loading={pinSaving} size="sm" variant="ghost">
              UPDATE PIN
            </Button>
          </div>
        </div>

        <div className="border-l-4 border-l-grey-mid pl-4 opacity-50">
          <h2 className="font-mono text-sm uppercase tracking-widest text-grey-light mb-1">COMING SOON</h2>
          <ul className="font-mono text-xs text-grey-light space-y-1">
            <li>• GLOBAL TIMEZONE DEFAULT</li>
            <li>• APP NAME (WHITE-LABEL)</li>
            <li>• SWIFTPOS / MYHR / LOADEDREPORTS STAFF SYNC</li>
            <li>• CHANGE LOGIN EMAIL</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
