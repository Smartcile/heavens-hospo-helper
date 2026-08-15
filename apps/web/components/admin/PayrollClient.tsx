'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { getActiveVenueId } from '@/lib/active-venue'

interface Period {  id: string
  startDate: string
  endDate: string
  status: string
  paidAt: string | null
  entryCount: number
}

interface Entry {
  id: string
  staffId: string
  totalHours: number
  hourlyRate: number
  totalPay: number
  ordinaryHours: number
  overtimeHours: number
  publicHolidayHours: number
  grossPay: number
  holidayPay: number
  annualLeaveAccruedHours: number
  alternativeDaysOwed: number
  paye: number
  accLevy: number
  kiwiSaverEmployee: number
  kiwiSaverEmployer: number
  studentLoan: number
  netPay: number
  employerCost: number
  breakdown: { dateKey: string; clockIn: string; clockOut: string; hours: number; breaksMinutes: number; type: string }[] | null
  staff: {
    firstName: string
    lastName: string
    employmentType: string | null
    taxCode: string | null
    kiwiSaverRate: number | null
    studentLoan: boolean
    hourlyRate: number | null
  }
}

interface PayrollSettings {
  payFrequency: string
  minimumWage: number
  accRate: number
  kiwiSaverEmployerRate: number
  studentLoanRate: number
  holidayPayPct: number
  defaultTaxCode: string
  overtimeEnabled: boolean
  overtimeHoursPerWeek: number
  overtimeRate: number
}

interface Holiday { id: string; date: string; name: string; isRegional: boolean; national: boolean }
interface AltDay { id: string; staffId: string; staffName: string; accruedOn: string; takenOn: string | null }

const FREQUENCIES = [
  { value: 'WEEKLY', label: 'WEEKLY' },
  { value: 'FORTNIGHTLY', label: 'FORTNIGHTLY' },
  { value: 'MONTHLY', label: 'MONTHLY' },
]

const TAX_CODES = ['M', 'M SL', 'S', 'S SL', 'SB', 'SB SL', 'SH', 'SH SL', 'ST', 'ST SL', 'CAE', 'CAE SL']

const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toFixed(2)}`)

export function PayrollClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string }) {
  const [venueId, setVenueId] = useState(() => getActiveVenueId(role, sessionVenueId, defaultVenueId))
  const [tab, setTab] = useState<'periods' | 'holidays' | 'altdays' | 'settings'>('periods')
  const [periods, setPeriods] = useState<Period[]>([])
  const [settings, setSettings] = useState<PayrollSettings | null>(null)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [altDays, setAltDays] = useState<AltDay[]>([])
  const [altFilter, setAltFilter] = useState<'0' | '1'>('0')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create period
  const [showCreate, setShowCreate] = useState(false)
  const [newPeriod, setNewPeriod] = useState({ startDate: '', endDate: '', frequency: 'WEEKLY' })
  const [busy, setBusy] = useState(false)

  // Expanded period
  const [openPeriod, setOpenPeriod] = useState<{ id: string; startDate: string; endDate: string; status: string; paidAt: string | null } | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [payslip, setPayslip] = useState<Entry | null>(null)

  // Settings form
  const [settingsForm, setSettingsForm] = useState<PayrollSettings | null>(null)

  // Holiday form
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '', isRegional: false })

  const loadPeriods = useCallback(async () => {
    if (!venueId) return
    const r = await fetch(`/api/admin/payroll/periods?venueId=${venueId}`)
    const d = await r.json()
    if (r.ok) setPeriods(d)
  }, [venueId])

  const loadSettings = useCallback(async () => {
    if (!venueId) return
    const r = await fetch(`/api/admin/payroll/settings?venueId=${venueId}`)
    const d = await r.json()
    if (r.ok) { setSettings(d); setSettingsForm(d) }
  }, [venueId])

  const loadHolidays = useCallback(async () => {
    if (!venueId) return
    const r = await fetch(`/api/admin/public-holidays?venueId=${venueId}`)
    const d = await r.json()
    if (r.ok) setHolidays(d)
  }, [venueId])

  const loadAltDays = useCallback(async () => {
    if (!venueId) return
    const r = await fetch(`/api/admin/payroll/alt-days?venueId=${venueId}&taken=${altFilter}`)
    const d = await r.json()
    if (r.ok) setAltDays(d)
  }, [venueId, altFilter])

  const loadAll = useCallback(async () => {
    setLoading(true); setError('')
    await Promise.all([loadPeriods(), loadSettings(), loadHolidays(), loadAltDays()])
    setLoading(false)
  }, [loadPeriods, loadSettings, loadHolidays, loadAltDays])

  useEffect(() => { if (venueId) loadAll() }, [venueId, loadAll])
  useEffect(() => { if (venueId && tab === 'altdays') loadAltDays() }, [venueId, tab, loadAltDays])

  async function createPeriod() {
    if (!newPeriod.startDate || !newPeriod.endDate) { setError('START AND END DATES ARE REQUIRED'); return }
    setBusy(true); setError('')
    const r = await fetch('/api/admin/payroll/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, ...newPeriod }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    setShowCreate(false)
    loadPeriods()
  }

  async function closePeriod(id: string) {
    if (!confirm('CLOSE THIS PERIOD? ENTRIES WILL BE CALCULATED FROM APPROVED CLOCKS.')) return
    setBusy(true); setError('')
    const r = await fetch(`/api/admin/payroll/periods/${id}`, { method: 'PUT' })
    setBusy(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    loadPeriods()
    if (openPeriod?.id === id) await openPeriodDetail(id, true)
  }

  async function markPaid(id: string) {
    setBusy(true); setError('')
    const r = await fetch(`/api/admin/payroll/periods/${id}`, { method: 'POST' })
    setBusy(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    loadPeriods()
  }

  async function openPeriodDetail(id: string, force = false) {
    if (openPeriod?.id === id && !force) { setOpenPeriod(null); return }
    setError('')
    const r = await fetch(`/api/admin/payroll/periods/${id}`)
    const d = await r.json()
    if (!r.ok) { setError(d.error ?? 'FAILED'); return }
    setOpenPeriod({ id, startDate: d.period.startDate, endDate: d.period.endDate, status: d.period.status, paidAt: d.period.paidAt })
    setEntries(d.entries)
  }

  async function saveSettings() {
    if (!settingsForm) return
    setBusy(true); setError('')
    const r = await fetch('/api/admin/payroll/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, ...settingsForm }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    loadSettings()
  }

  async function addHoliday() {
    if (!holidayForm.date || !holidayForm.name) { setError('DATE AND NAME ARE REQUIRED'); return }
    setBusy(true); setError('')
    const r = await fetch('/api/admin/public-holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, ...holidayForm }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    setHolidayForm({ date: '', name: '', isRegional: false })
    loadHolidays()
  }

  async function deleteHoliday(id: string) {
    if (!confirm('DELETE THIS PUBLIC HOLIDAY?')) return
    await fetch(`/api/admin/public-holidays?id=${id}`, { method: 'DELETE' })
    loadHolidays()
  }

  async function setAltTaken(id: string, taken: boolean) {
    const r = await fetch('/api/admin/payroll/alt-days', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, takenOn: taken ? new Date().toISOString().slice(0, 10) : null }),
    })
    if (r.ok) loadAltDays()
  }

  const totals = entries.reduce(
    (t, e) => ({
      gross: t.gross + (e.grossPay ?? e.totalPay),
      paye: t.paye + (e.paye ?? 0),
      kiwi: t.kiwi + (e.kiwiSaverEmployee ?? 0),
      net: t.net + (e.netPay ?? 0),
      cost: t.cost + (e.employerCost ?? 0),
      hours: t.hours + e.totalHours,
    }),
    { gross: 0, paye: 0, kiwi: 0, net: 0, cost: 0, hours: 0 }
  )

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">PAYROLL</h1>
        <Button size="sm" variant="ghost" onClick={() => { setShowCreate(true); setError('') }}>+ NEW PERIOD</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-grey-mid pb-2">
        {([['periods', 'PERIODS'], ['holidays', 'PUBLIC HOLIDAYS'], ['altdays', 'ALT DAYS'], ['settings', 'SETTINGS']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`font-mono text-xs uppercase px-3 py-2 border transition-colors ${tab === key ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="font-mono text-xs text-danger">{error}</p>}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : tab === 'periods' ? (
        <div className="space-y-3">
          {periods.length === 0 && (
            <div className="border border-grey-mid p-4">
              <p className="font-mono text-xs text-grey-light">NO PAY PERIODS YET. CREATE ONE TO START PAYROLL.</p>
            </div>
          )}
          {periods.map((p) => (
            <div key={p.id} className="border border-grey-mid bg-grey-dark">
              <div className="p-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-sm font-bold uppercase text-white">{p.startDate} → {p.endDate}</div>
                  <div className="font-mono text-[10px] text-grey-light mt-0.5">{p.entryCount} ENTR{p.entryCount === 1 ? 'Y' : 'IES'}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 font-mono text-[10px] uppercase border ${p.status === 'CLOSED' ? (p.paidAt ? 'bg-success/15 text-success border-success' : 'bg-warning/10 text-warning border-warning') : 'text-grey-light border-grey-mid'}`}>
                    {p.status}{p.paidAt ? ' / PAID' : ''}
                  </span>
                  {p.status === 'OPEN' && (
                    <Button size="sm" onClick={() => closePeriod(p.id)} loading={busy}>CLOSE PERIOD</Button>
                  )}
                  {p.status === 'CLOSED' && (
                    <>
                      {!p.paidAt && <Button size="sm" onClick={() => markPaid(p.id)} loading={busy}>MARK PAID</Button>}
                      <a href={`/api/admin/payroll/periods/${p.id}/export?format=csv`} className="font-mono text-[10px] uppercase border border-grey-mid px-3 py-1.5 text-grey-light hover:text-white hover:border-white">CSV</a>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openPeriodDetail(p.id)}>{openPeriod?.id === p.id ? 'HIDE' : 'ENTRIES'}</Button>
                </div>
              </div>

              {openPeriod?.id === p.id && (
                <div className="border-t border-grey-mid overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-grey-mid">
                        <th className="px-3 py-2 font-mono text-[10px] text-grey-light uppercase">STAFF</th>
                        <th className="px-3 py-2 font-mono text-[10px] text-grey-light uppercase">HOURS (ORD/OT/PH)</th>
                        <th className="px-3 py-2 font-mono text-[10px] text-grey-light uppercase">GROSS</th>
                        <th className="px-3 py-2 font-mono text-[10px] text-grey-light uppercase">HOL PAY</th>
                        <th className="px-3 py-2 font-mono text-[10px] text-grey-light uppercase">PAYE</th>
                        <th className="px-3 py-2 font-mono text-[10px] text-grey-light uppercase">ACC</th>
                        <th className="px-3 py-2 font-mono text-[10px] text-grey-light uppercase">KIWI</th>
                        <th className="px-3 py-2 font-mono text-[10px] text-grey-light uppercase">SL</th>
                        <th className="px-3 py-2 font-mono text-[10px] text-grey-light uppercase">NET</th>
                        <th className="px-3 py-2 font-mono text-[10px] text-grey-light uppercase">ALT</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-grey-mid">
                      {entries.length === 0 && (
                        <tr><td colSpan={11} className="px-3 py-3 font-mono text-xs text-grey-light">NO ENTRIES — CLOSE THE PERIOD TO CALCULATE.</td></tr>
                      )}
                      {entries.map((e) => (
                        <tr key={e.id} className="hover:bg-black/20">
                          <td className="px-3 py-2">
                            <div className="font-mono text-xs text-white">{e.staff.firstName} {e.staff.lastName}</div>
                            <div className="font-mono text-[10px] text-grey-light">{e.staff.employmentType ?? '—'}{e.staff.taxCode ? ` · ${e.staff.taxCode}` : ''}</div>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-grey-light">
                            {(e.ordinaryHours ?? 0).toFixed(2)} / {(e.overtimeHours ?? 0).toFixed(2)} / {(e.publicHolidayHours ?? 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-white">{money(e.grossPay ?? e.totalPay)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-grey-light">{money(e.holidayPay)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-grey-light">{money(e.paye)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-grey-light">{money(e.accLevy)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-grey-light">{money(e.kiwiSaverEmployee)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-grey-light">{money(e.studentLoan)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-white">{money(e.netPay)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-grey-light">{e.alternativeDaysOwed ?? 0}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => setPayslip(e)} className="font-mono text-[10px] uppercase text-grey-light border border-grey-mid px-2 py-1 hover:text-white hover:border-white">PAYSLIP</button>
                          </td>
                        </tr>
                      ))}
                      {entries.length > 0 && (
                        <tr className="border-t-2 border-grey-mid">
                          <td className="px-3 py-2 font-mono text-[10px] uppercase text-grey-light">TOTALS</td>
                          <td className="px-3 py-2 font-mono text-xs text-white">{totals.hours.toFixed(2)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-white">{money(totals.gross)}</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 font-mono text-xs text-white">{money(totals.paye)}</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 font-mono text-xs text-white">{money(totals.kiwi)}</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 font-mono text-xs text-white">{money(totals.net)}</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 font-mono text-xs text-grey-light">{money(totals.cost)} EMP COST</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : tab === 'holidays' ? (
        <div className="space-y-3">
          <div className="border border-grey-mid p-4 space-y-3 bg-grey-dark">
            <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">ADD HOLIDAY</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input label="Date" type="date" value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} />
              <Input label="Name" value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="e.g. WELLINGTON ANNIVERSARY" />
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 font-mono text-xs uppercase text-grey-light cursor-pointer">
                  <input type="checkbox" checked={holidayForm.isRegional} onChange={(e) => setHolidayForm({ ...holidayForm, isRegional: e.target.checked })} className="accent-white" />
                  REGIONAL
                </label>
              </div>
              <Button size="sm" onClick={addHoliday} loading={busy}>+ ADD</Button>
            </div>
          </div>
          <div className="border border-grey-mid bg-grey-dark divide-y divide-grey-mid">
            {holidays.length === 0 && <div className="p-4 font-mono text-xs text-grey-light">NO PUBLIC HOLIDAYS. NATIONAL DEFAULTS ARE SEEDED.</div>}
            {holidays.map((h) => (
              <div key={h.id} className="px-4 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-white">{h.date}</span>
                  <span className="font-mono text-xs text-grey-light truncate">{h.name}</span>
                  {h.isRegional && <span className="font-mono text-[9px] uppercase text-grey-light border border-grey-mid px-1.5 py-0.5">REGIONAL</span>}
                  {h.national && <span className="font-mono text-[9px] uppercase text-accent border border-grey-mid px-1.5 py-0.5">NATIONAL</span>}
                </div>
                {!h.national && (
                  <button onClick={() => deleteHoliday(h.id)} className="font-mono text-[10px] uppercase text-grey-light hover:text-danger transition-colors">DEL</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : tab === 'altdays' ? (
        <div className="space-y-3">
          <div className="flex gap-1">
            {([['0', 'OWED'], ['1', 'TAKEN']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setAltFilter(v)}
                className={`font-mono text-xs uppercase px-3 py-2 border transition-colors ${altFilter === v ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="border border-grey-mid bg-grey-dark divide-y divide-grey-mid">
            {altDays.length === 0 && <div className="p-4 font-mono text-xs text-grey-light">NO ALTERNATIVE DAYS {altFilter === '0' ? 'OWED' : 'TAKEN'}.</div>}
            {altDays.map((d) => (
              <div key={d.id} className="px-4 py-2 flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-xs text-white">{d.staffName}</div>
                  <div className="font-mono text-[10px] text-grey-light">ACCRUED {d.accruedOn}{d.takenOn ? ` · TAKEN ${d.takenOn}` : ''}</div>
                </div>
                {d.takenOn ? (
                  <button onClick={() => setAltTaken(d.id, false)} className="font-mono text-[10px] uppercase text-grey-light border border-grey-mid px-2 py-1 hover:text-white">UNTAKE</button>
                ) : (
                  <Button size="sm" onClick={() => setAltTaken(d.id, true)}>TAKE DAY</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* SETTINGS */
        <div className="space-y-3">
          {settingsForm && (
            <div className="border border-grey-mid p-4 space-y-4 bg-grey-dark max-w-2xl">
              <div className="grid grid-cols-2 gap-3">
                <Select label="Pay Frequency"
                  value={settingsForm.payFrequency}
                  onChange={(e) => setSettingsForm({ ...settingsForm, payFrequency: e.target.value })}
                  options={FREQUENCIES} />
                <Input label="Minimum Wage ($/hr)" type="number" step="0.01" value={String(settingsForm.minimumWage)} onChange={(e) => setSettingsForm({ ...settingsForm, minimumWage: Number(e.target.value) })} />
                <Input label="ACC Earner Levy (%)" type="number" step="0.01" value={String(settingsForm.accRate)} onChange={(e) => setSettingsForm({ ...settingsForm, accRate: Number(e.target.value) })} />
                <Input label="KiwiSaver Employer (%)" type="number" step="0.01" value={String(settingsForm.kiwiSaverEmployerRate)} onChange={(e) => setSettingsForm({ ...settingsForm, kiwiSaverEmployerRate: Number(e.target.value) })} />
                <Input label="Student Loan (%)" type="number" step="0.01" value={String(settingsForm.studentLoanRate)} onChange={(e) => setSettingsForm({ ...settingsForm, studentLoanRate: Number(e.target.value) })} />
                <Input label="Casual Holiday Pay (%)" type="number" step="0.01" value={String(settingsForm.holidayPayPct)} onChange={(e) => setSettingsForm({ ...settingsForm, holidayPayPct: Number(e.target.value) })} />
                <Select label="Default Tax Code"
                  value={settingsForm.defaultTaxCode}
                  onChange={(e) => setSettingsForm({ ...settingsForm, defaultTaxCode: e.target.value })}
                  options={TAX_CODES.map((c) => ({ value: c, label: c }))} />
              </div>
              <div className="border border-grey-mid p-3 space-y-3">
                <label className="flex items-center gap-2 font-mono text-xs uppercase text-grey-light cursor-pointer">
                  <input type="checkbox" checked={settingsForm.overtimeEnabled} onChange={(e) => setSettingsForm({ ...settingsForm, overtimeEnabled: e.target.checked })} className="accent-white" />
                  OVERTIME (CONTRACTUAL — NZ HAS NO STATUTORY OT)
                </label>
                {settingsForm.overtimeEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Weekly threshold (hrs)" type="number" step="0.5" value={String(settingsForm.overtimeHoursPerWeek)} onChange={(e) => setSettingsForm({ ...settingsForm, overtimeHoursPerWeek: Number(e.target.value) })} />
                    <Input label="Overtime rate (×)" type="number" step="0.1" value={String(settingsForm.overtimeRate)} onChange={(e) => setSettingsForm({ ...settingsForm, overtimeRate: Number(e.target.value) })} />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] text-grey-light">STATUTORY RATES CHANGE ANNUALLY — CHECK IRD BEFORE EACH TAX YEAR. THIS APP IS NOT A TAX ADVISER.</p>
                <Button size="sm" onClick={saveSettings} loading={busy}>SAVE</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* New period modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">NEW PAY PERIOD</h2>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Start" type="date" value={newPeriod.startDate} onChange={(e) => setNewPeriod({ ...newPeriod, startDate: e.target.value })} />
              <Input label="End" type="date" value={newPeriod.endDate} onChange={(e) => setNewPeriod({ ...newPeriod, endDate: e.target.value })} />
            </div>
            <Select label="Frequency" value={newPeriod.frequency}
              onChange={(e) => setNewPeriod({ ...newPeriod, frequency: e.target.value })}
              options={FREQUENCIES} />
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={createPeriod} loading={busy}>CREATE</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>CANCEL</Button>
            </div>
          </div>
        </div>
      )}

      {/* Payslip modal */}
      {payslip && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPayslip(null)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-white">PAYSLIP — {payslip.staff.firstName} {payslip.staff.lastName}</h2>
            <p className="font-mono text-[10px] text-grey-light uppercase">
              {openPeriod?.startDate} → {openPeriod?.endDate} · {payslip.staff.employmentType ?? '—'} · TAX CODE {payslip.staff.taxCode ?? 'M'} · KIWI {payslip.staff.kiwiSaverRate ? `${payslip.staff.kiwiSaverRate}%` : 'NO'} · SL {payslip.staff.studentLoan ? 'YES' : 'NO'}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {[
                ['ORDINARY HOURS', `${(payslip.ordinaryHours ?? 0).toFixed(2)}`],
                ['OVERTIME HOURS', `${(payslip.overtimeHours ?? 0).toFixed(2)}`],
                ['PUBLIC HOLIDAY HOURS', `${(payslip.publicHolidayHours ?? 0).toFixed(2)}`],
                ['TOTAL HOURS', `${payslip.totalHours.toFixed(2)}`],
                ['RATE', money(payslip.hourlyRate)],
                ['GROSS PAY', money(payslip.grossPay ?? payslip.totalPay)],
                ['HOLIDAY PAY (8% CASUAL)', money(payslip.holidayPay)],
                ['ANNUAL LEAVE ACCRUED', `${(payslip.annualLeaveAccruedHours ?? 0).toFixed(2)}H`],
                ['PAYE', money(payslip.paye)],
                ['ACC EARNER LEVY', money(payslip.accLevy)],
                ['KIWISAVER (EMP)', money(payslip.kiwiSaverEmployee)],
                ['STUDENT LOAN', money(payslip.studentLoan)],
                ['NET PAY', money(payslip.netPay)],
                ['EMPLOYER COST', money(payslip.employerCost)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-grey-mid/50 py-1">
                  <span className="font-mono text-[10px] uppercase text-grey-light">{label}</span>
                  <span className={`font-mono text-xs ${label === 'NET PAY' ? 'font-bold text-white' : 'text-grey-light'}`}>{value}</span>
                </div>
              ))}
            </div>
            {payslip.breakdown && payslip.breakdown.length > 0 && (
              <div>
                <h3 className="font-mono text-[10px] uppercase text-grey-light tracking-wider mb-1">SESSION DETAIL</h3>
                <div className="space-y-1">
                  {payslip.breakdown.map((b, i) => (
                    <div key={i} className="flex items-center justify-between border border-grey-mid px-2 py-1">
                      <span className="font-mono text-[10px] text-grey-light">
                        {b.dateKey} · {new Date(b.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}—{new Date(b.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="font-mono text-[10px] text-white">{b.type} · {b.hours.toFixed(2)}H{b.breaksMinutes ? ` · ${b.breaksMinutes}M BRK` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button size="sm" variant="ghost" onClick={() => setPayslip(null)}>CLOSE</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
