'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EMPTY_ADMIN_TAP_STATE,
  appendPlateKey,
  formatKioskCountdown,
  kioskCountdownProgress,
  registerAdminTap,
  removeLastPlateKey,
  type AdminTapState,
} from '@/lib/parking-kiosk'
import { PlateKeypad } from './PlateKeypad'
import { PinKeypad } from './PinKeypad'

export interface KioskFourHourHealth {
  ok: boolean
  stale: boolean
  message: string
}

export interface KioskFourHourType {
  id: string
  name: string
  windowLabel: string | null
  durationMinutes: number
  health: KioskFourHourHealth | null
}

export interface KioskParkingConfig {
  venueId: string
  requireCode: boolean
  venueName: string
  guestEnabled: boolean
  carparkName: string
  durationMinutes: number
  timezone: string
  resetSeconds: number
  fourHourTypes: KioskFourHourType[]
}

interface KioskResult {
  status: string
  ok?: boolean
  message?: string
  plate: string
  endTime: string | null
  expiresAt?: string | null
  existingExpiry?: string | null
  alreadyActive?: boolean
  qrDataUrl: string | null
  linkUrl: string | null
  typeName?: string
  memberName?: string | null
  validFrom?: string | null
  validUntil?: string | null
  locations?: string[]
  fallbackUrl?: string | null
  manualToken?: string | null
  claimId?: string
}

interface CredentialView {
  kind: 'MEMBER' | 'ADMIN_PIN'
  type: { id: string; name: string; windowLabel: string | null; durationMinutes: number }
  member: {
    id: string
    firstName: string
    lastName: string
    plates: { id: string; plate: string; isDefault: boolean }[]
  } | null
  token: string
}

type GuestStage = 'entry' | 'submitting' | 'result'
type FourStage = 'type' | 'credential' | 'member' | 'plate' | 'claiming' | 'result' | 'ask'
type Tab = 'guest' | 'four'

const GUEST_RESULT_TIMEOUT_MS = 20_000
const FOUR_RESULT_TIMEOUT_MS = 100_000
const HOLD_EXIT_MS = 5_000
const FALLBACK_IDLE_RESET_MS = 5 * 60_000

const HOLD_LABEL = 'SPEAK WITH STAFF IF YOU NEED HELP'

function appendDigit(value: string, key: string, max = 8): string {
  const digits = String(key).replace(/\D/g, '')
  if (!digits) return value
  // Membership numbers are 2-5 digits; admin PINs are 4-8.
  return `${value}${digits}`.slice(0, max)
}

function removeLastDigit(value: string): string {
  return value.slice(0, -1)
}

function fourTitle(result: KioskResult): string {
  switch (result.status) {
    case 'CONFIRMED':
      return 'PARKING CONFIRMED'
    case 'ALREADY_CLAIMED':
      return 'ALREADY REGISTERED'
    case 'EXHAUSTED':
      return 'NO PARKING SLOTS'
    case 'MANUAL_CONFIRMED':
      return 'THANK YOU — CONFIRMED'
    case 'MANUAL_UNCONFIRMED':
      return 'NOT CONFIRMED'
    case 'CAPTCHA_BLOCKED':
      return 'COULD NOT START'
    default:
      return 'COULD NOT START'
  }
}

function fourTone(result: KioskResult): string {
  if (result.status === 'CONFIRMED' || result.status === 'MANUAL_CONFIRMED') {
    return 'text-success'
  }
  if (result.status === 'ALREADY_CLAIMED') return 'text-warning'
  if (result.status === 'MANUAL_UNCONFIRMED' || result.status === 'EXHAUSTED') {
    return 'text-warning'
  }
  return 'text-danger'
}

export function KioskParkingClient({ config }: { config: KioskParkingConfig }) {
  const [tab, setTab] = useState<Tab>(config.guestEnabled ? 'guest' : 'four')

  // 90 minute
  const [guestStage, setGuestStage] = useState<GuestStage>('entry')
  const [guestPlate, setGuestPlate] = useState('')
  const [guestResult, setGuestResult] = useState<KioskResult | null>(null)
  const [guestError, setGuestError] = useState('')
  const [guestSeconds, setGuestSeconds] = useState(config.resetSeconds)
  const guestAbort = useRef<AbortController | null>(null)

  // 4 hour
  const [fourStage, setFourStage] = useState<FourStage>('type')
  const [selectedType, setSelectedType] = useState<KioskFourHourType | null>(null)
  const [credentialInput, setCredentialInput] = useState('')
  const [credential, setCredential] = useState<CredentialView | null>(null)
  const [fourPlate, setFourPlate] = useState('')
  const [fourSelectedPlate, setFourSelectedPlate] = useState('')
  const [addingPlate, setAddingPlate] = useState(false)
  const [fourError, setFourError] = useState('')
  const [fourResult, setFourResult] = useState<KioskResult | null>(null)
  const [fourSeconds, setFourSeconds] = useState(config.resetSeconds)
  const [manualBusy, setManualBusy] = useState(false)
  const [manualNote, setManualNote] = useState('')
  const [adminMode, setAdminMode] = useState(false)
  const fourAbort = useRef<AbortController | null>(null)

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const footerDownAt = useRef<number | null>(null)
  const footerHeld = useRef(false)
  const footerTaps = useRef<AdminTapState>(EMPTY_ADMIN_TAP_STATE)

  // A customer must not be able to browse away from the kiosk.
  useEffect(() => {
    const guard = () => window.history.pushState(null, '', window.location.href)
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', guard)
    return () => window.removeEventListener('popstate', guard)
  }, [])

  const resetGuest = useCallback(() => {
    guestAbort.current?.abort()
    setGuestPlate('')
    setGuestResult(null)
    setGuestError('')
    setGuestSeconds(config.resetSeconds)
    setGuestStage('entry')
  }, [config.resetSeconds])

  const resetFourState = useCallback(() => {
    fourAbort.current?.abort()
    setFourStage('type')
    setSelectedType(null)
    setCredentialInput('')
    setCredential(null)
    setFourPlate('')
    setFourSelectedPlate('')
    setAddingPlate(false)
    setFourError('')
    setFourResult(null)
    setFourSeconds(config.resetSeconds)
    setManualBusy(false)
    setManualNote('')
  }, [config.resetSeconds])

  const resetFour = useCallback(() => {
    resetFourState()
    setAdminMode(false)
  }, [resetFourState])

  // The 4-hour START AGAIN returns to the 90-minute screen when it exists.
  const startAgainFromFour = useCallback(() => {
    resetFour()
    resetGuest()
    setTab(config.guestEnabled ? 'guest' : 'four')
  }, [config.guestEnabled, resetFour, resetGuest])

  const switchTab = useCallback(
    (next: Tab) => {
      if (next === tab) return
      resetGuest()
      resetFour()
      setTab(next)
    },
    [tab, resetGuest, resetFour],
  )

  // One type: skip the tile screen.
  useEffect(() => {
    if (tab !== 'four' || fourStage !== 'type') return
    if (config.fourHourTypes.length !== 1) return
    setSelectedType(config.fourHourTypes[0])
    setFourStage('credential')
  }, [tab, fourStage, config.fourHourTypes])

  // Guest reset timer.
  useEffect(() => {
    if (guestStage !== 'result') return
    setGuestSeconds(config.resetSeconds)
    const timer = setInterval(() => {
      setGuestSeconds((current) => (current <= 1 ? 0 : current - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [guestStage, config.resetSeconds])

  useEffect(() => {
    if (guestStage === 'result' && guestSeconds === 0) resetGuest()
  }, [guestStage, guestSeconds, resetGuest])

  // 4 hour reset timer only for a confirmed/already result.
  useEffect(() => {
    if (fourStage !== 'result' || !fourResult) return
    if (fourResult.status !== 'CONFIRMED' && fourResult.status !== 'ALREADY_CLAIMED') return
    setFourSeconds(config.resetSeconds)
    const timer = setInterval(() => {
      setFourSeconds((current) => (current <= 1 ? 0 : current - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [fourStage, fourResult, config.resetSeconds])

  useEffect(() => {
    if (
      fourStage === 'result' &&
      fourSeconds === 0 &&
      fourResult &&
      (fourResult.status === 'CONFIRMED' || fourResult.status === 'ALREADY_CLAIMED')
    ) {
      startAgainFromFour()
    }
  }, [fourStage, fourSeconds, fourResult, startAgainFromFour])

  // Abandoned fallback question: return to the start after five minutes.
  useEffect(() => {
    if (fourStage !== 'ask') return
    const timer = setTimeout(() => startAgainFromFour(), FALLBACK_IDLE_RESET_MS)
    return () => clearTimeout(timer)
  }, [fourStage, startAgainFromFour])

  useEffect(() => {
    return () => {
      guestAbort.current?.abort()
      fourAbort.current?.abort()
      if (holdTimer.current) clearTimeout(holdTimer.current)
    }
  }, [])

  // ----- 90 minute -----

  function guestPress(key: string) {
    setGuestError('')
    setGuestPlate((current) => appendPlateKey(current, key))
  }

  async function submitGuest() {
    if (guestStage !== 'entry' || !guestPlate) return
    setGuestError('')
    setGuestStage('submitting')
    const controller = new AbortController()
    guestAbort.current = controller
    const timeout = setTimeout(() => controller.abort(), GUEST_RESULT_TIMEOUT_MS)

    try {
      const res = await fetch('/api/public/parking/kiosk/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licensePlate: guestPlate, venueId: config.venueId }),
        cache: 'no-store',
        signal: controller.signal,
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 401) {
        window.location.reload()
        return
      }
      if (res.status === 422) {
        setGuestError(body.error || 'CHECK THE NUMBER PLATE')
        setGuestStage('entry')
        return
      }
      if (!res.ok) {
        setGuestResult({
          status: 'FAILED',
          ok: false,
          message: body.error || 'COULD NOT REGISTER',
          plate: guestPlate,
          endTime: null,
          qrDataUrl: body.qrDataUrl ?? null,
          linkUrl: body.linkUrl ?? null,
        })
        setGuestStage('result')
        return
      }
      setGuestResult(body as KioskResult)
      setGuestStage('result')
    } catch (caught) {
      const aborted = caught instanceof Error && caught.name === 'AbortError'
      setGuestError(
        aborted
          ? 'TIMED OUT — PLEASE SPEAK WITH STAFF'
          : 'COULD NOT CONNECT — PLEASE SPEAK WITH STAFF',
      )
      setGuestStage('entry')
    } finally {
      clearTimeout(timeout)
      guestAbort.current = null
    }
  }

  // ----- 4 hour -----

  function chooseType(type: KioskFourHourType) {
    setSelectedType(type)
    setCredentialInput('')
    setCredential(null)
    setFourError('')
    setFourStage('credential')
  }

  async function submitCredential() {
    const minimum = adminMode ? 4 : 2
    if (!selectedType || credentialInput.length < minimum) return
    setFourError('')
    try {
      const res = await fetch('/api/public/parking/kiosk/credential', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId: config.venueId,
          typeId: selectedType.id,
          credential: credentialInput,
          mode: adminMode ? 'ADMIN' : 'MEMBER',
        }),
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setFourError(body.error || 'NOT RECOGNISED — SPEAK WITH STAFF')
        return
      }
      if (!res.ok) {
        setFourError(body.error || 'COULD NOT CHECK THAT NUMBER')
        return
      }
      const view = body as CredentialView
      setCredential(view)
      setSelectedType((current) =>
        current
          ? {
              ...current,
              name: view.type.name,
              windowLabel: view.type.windowLabel,
              durationMinutes: view.type.durationMinutes,
            }
          : current,
      )
      const plates = view.member?.plates ?? []
      if (view.member && plates.length > 0) {
        const preferred = plates.find((plate) => plate.isDefault) ?? plates[0]
        setFourSelectedPlate(preferred.plate)
        setAddingPlate(false)
        setFourStage('member')
      } else {
        setFourSelectedPlate('')
        setAddingPlate(true)
        setFourPlate('')
        setFourStage('plate')
      }
    } catch {
      setFourError('COULD NOT CONNECT — TRY AGAIN')
    }
  }

  function memberUsesSaved(plate: string) {
    setFourSelectedPlate(plate)
    setAddingPlate(false)
  }

  function memberAddsNew() {
    setFourSelectedPlate('')
    setAddingPlate(true)
    setFourPlate('')
    setFourStage('plate')
  }

  async function submitFourClaim(rawPlate: string) {
    const plate = rawPlate.trim()
    if (!credential || !selectedType || !plate) return
    setFourError('')
    setFourStage('claiming')
    const controller = new AbortController()
    fourAbort.current = controller
    const timeout = setTimeout(() => controller.abort(), FOUR_RESULT_TIMEOUT_MS)

    try {
      const res = await fetch('/api/public/parking/kiosk/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credential.token, plate }),
        cache: 'no-store',
        signal: controller.signal,
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 401) {
        window.location.reload()
        return
      }
      if (res.status === 422) {
        setFourError(body.error || 'CHECK THE NUMBER PLATE')
        setFourStage(addingPlate || !credential.member ? 'plate' : 'member')
        return
      }
      if (!res.ok) {
        setFourResult({
          status: 'FAILED',
          ok: false,
          message: body.error || 'COULD NOT START PARKING',
          plate,
          endTime: null,
          qrDataUrl: null,
          linkUrl: null,
          typeName: selectedType.name,
          fallbackUrl: body.fallbackUrl ?? null,
          manualToken: body.manualToken ?? null,
        })
        setFourStage('result')
        return
      }
      setFourResult(body as KioskResult)
      setFourStage('result')
    } catch (caught) {
      const aborted = caught instanceof Error && caught.name === 'AbortError'
      setFourResult({
        status: 'FAILED',
        ok: false,
        message: aborted
          ? 'THE PARKING SITE TOOK TOO LONG — USE THE PARKING PAGE'
          : 'COULD NOT CONNECT — USE THE PARKING PAGE',
        plate,
        endTime: null,
        qrDataUrl: null,
        linkUrl: null,
        typeName: selectedType.name,
      })
      setFourStage('result')
    } finally {
      clearTimeout(timeout)
      fourAbort.current = null
    }
  }

  function openFallback() {
    if (!fourResult?.fallbackUrl) return
    setManualBusy(true)
    setManualNote('')

    // Open first: awaiting a request here would let iOS treat it as a pop-up
    // and block the new tab.
    const opened = window.open(fourResult.fallbackUrl, '_blank')
    if (fourResult.manualToken) {
      void fetch('/api/public/parking/kiosk/claim/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: fourResult.manualToken, outcome: 'OPENED' }),
      }).catch(() => undefined)
    }
    setManualBusy(false)

    if (!opened) {
      // Pop-up blocked. Same-tab navigation; browser back returns to the kiosk.
      setFourStage('ask')
      window.location.href = fourResult.fallbackUrl
      return
    }
    setFourStage('ask')
  }

  async function answerManual(confirmed: boolean) {
    if (!fourResult?.manualToken) {
      setFourStage('result')
      return
    }
    setManualBusy(true)
    try {
      await fetch('/api/public/parking/kiosk/claim/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: fourResult.manualToken,
          outcome: confirmed ? 'CONFIRMED' : 'NOT_CONFIRMED',
        }),
      }).catch(() => undefined)
      setFourResult({
        ...fourResult,
        status: confirmed ? 'MANUAL_CONFIRMED' : 'MANUAL_UNCONFIRMED',
        message: confirmed
          ? 'PARKING STARTED ON THE PARKING PAGE.'
          : 'THE PARKING PAGE WAS NOT COMPLETED.',
      })
      setFourStage('result')
    } finally {
      setManualBusy(false)
    }
  }

  function backFromPlate() {
    if (credential?.member && (credential.member.plates.length > 0 || addingPlate)) {
      setFourStage(credential.member.plates.length > 0 ? 'member' : 'credential')
    } else {
      setFourStage('credential')
    }
  }

  // ----- silent hold-to-exit + hidden admin tap gesture -----

  function enterAdminMode() {
    if (config.fourHourTypes.length === 0) return
    footerTaps.current = EMPTY_ADMIN_TAP_STATE
    resetGuest()
    resetFourState()
    setAdminMode(true)
    setTab('four')
    if (config.fourHourTypes.length === 1) {
      setSelectedType(config.fourHourTypes[0])
      setFourStage('credential')
    }
  }

  function exitAdminMode() {
    resetFour()
    setTab(config.guestEnabled ? 'guest' : 'four')
  }

  function handleFooterTap() {
    const result = registerAdminTap(footerTaps.current, Date.now())
    footerTaps.current = result.state
    if (result.triggered && !adminMode) enterAdminMode()
  }

  function startHold() {
    footerDownAt.current = Date.now()
    footerHeld.current = false
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null
      footerHeld.current = true
      window.location.href = '/'
    }, HOLD_EXIT_MS)
  }

  function stopHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
    const downAt = footerDownAt.current
    footerDownAt.current = null
    if (footerHeld.current) {
      footerHeld.current = false
      return
    }
    if (downAt !== null && Date.now() - downAt < 500) handleFooterTap()
  }

  function cancelHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
    footerDownAt.current = null
    footerHeld.current = false
  }

  const guestSlots = Array.from({ length: 6 }, (_, index) => guestPlate[index] ?? '')
  const fourSlots = Array.from({ length: 6 }, (_, index) => fourPlate[index] ?? '')
  const selectedTypeName = selectedType?.name ?? ''
  const guestTitle =
    guestResult?.status === 'CONFIRMED'
      ? 'PARKING REGISTERED'
      : guestResult?.status === 'ALREADY_ACTIVE'
        ? 'ALREADY REGISTERED'
        : 'COULD NOT REGISTER'

  const keypadScreen =
    (tab === 'guest' && guestStage !== 'result') ||
    (tab === 'four' && (fourStage === 'credential' || fourStage === 'plate'))

  return (
    <div
      data-admin={adminMode ? 'true' : 'false'}
      className={`flex h-full w-full select-none flex-col overflow-hidden text-white ${
        adminMode ? 'bg-admin-red' : 'bg-black'
      }`}
    >
      <header
        className={`shrink-0 border-b px-5 py-3 ${
          adminMode ? 'border-danger/60' : 'border-grey-mid'
        }`}
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm uppercase tracking-widest text-grey-light">
              {config.venueName || 'VENUE'}
            </p>
            <h1 className="truncate font-mono text-xl font-bold uppercase tracking-widest">
              {tab === 'four' && selectedTypeName
                ? selectedTypeName
                : config.carparkName || 'CARPARK'}
            </h1>
          </div>
          <p className="shrink-0 border border-success/50 px-3 py-1.5 font-mono text-sm font-bold uppercase tracking-wider text-success">
            {tab === 'four' && selectedType ? selectedType.name : `${config.durationMinutes} MIN FREE`}
          </p>
        </div>
      </header>

      {(config.guestEnabled || config.fourHourTypes.length > 0) && (
        <div
          className={`shrink-0 border-b ${
            adminMode ? 'border-danger/60' : 'border-grey-mid'
          }`}
        >
          <div className="flex">
            {config.guestEnabled && (
              <button
                type="button"
                onClick={() => switchTab('guest')}
                className={`flex-1 border-r border-grey-mid py-2 font-mono text-xs font-bold uppercase tracking-widest ${
                  tab === 'guest' ? 'bg-white text-black' : 'text-grey-light'
                }`}
              >
                {config.durationMinutes} MINUTE
              </button>
            )}
            {config.fourHourTypes.length > 0 && (
              <button
                type="button"
                onClick={() => switchTab('four')}
                className={`flex-1 py-2 font-mono text-xs font-bold uppercase tracking-widest ${
                  tab === 'four' ? 'bg-white text-black' : 'text-grey-light'
                }`}
              >
                4 HOUR
              </button>
            )}
          </div>
        </div>
      )}

      {adminMode && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-danger/60 bg-danger/15 px-3 py-2">
          <p className="font-mono text-sm font-bold uppercase tracking-widest text-danger">
            ADMIN MODE — PIN HIDDEN
          </p>
          <button
            type="button"
            onClick={exitAdminMode}
            className="border border-danger/60 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-danger"
          >
            EXIT ADMIN
          </button>
        </div>
      )}

      <main
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${
          keypadScreen
            ? 'items-stretch px-1 py-1'
            : 'items-center justify-center px-4 py-3'
        }`}
      >
        {tab === 'guest' ? (
          guestStage === 'result' ? (
            guestResult && (
              <div className="flex w-full max-w-3xl flex-col items-center gap-3" aria-live="polite">
                <p
                  className={`text-center font-mono text-2xl font-bold uppercase tracking-widest md:text-3xl ${
                    guestResult.status === 'CONFIRMED'
                      ? 'text-success'
                      : guestResult.status === 'ALREADY_ACTIVE'
                        ? 'text-warning'
                        : 'text-danger'
                  }`}
                >
                  {guestTitle}
                </p>
                <p className="font-mono text-4xl font-bold tracking-[0.35em] text-white md:text-5xl">
                  {guestResult.plate}
                </p>

                {guestResult.status === 'CONFIRMED' && guestResult.endTime && (
                  <p className="text-center font-mono text-xl uppercase tracking-wider text-white">
                    FREE PARKING UNTIL{' '}
                    <span className="font-bold text-success">{guestResult.endTime}</span>
                  </p>
                )}
                {guestResult.status === 'ALREADY_ACTIVE' && (
                  <p className="text-center font-mono text-lg uppercase tracking-wider text-white">
                    THIS PLATE ALREADY HAS A SESSION TODAY
                    {guestResult.existingExpiry ? ` — UNTIL ${guestResult.existingExpiry}` : ''}
                  </p>
                )}
                {guestResult.status === 'FAILED' && (
                  <p className="text-center font-mono text-lg uppercase text-danger">
                    {guestResult.message || 'PLEASE SPEAK WITH STAFF'}
                  </p>
                )}

                {guestResult.qrDataUrl && (
                  <div className="flex flex-col items-center gap-2 rounded-sm bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={guestResult.qrDataUrl}
                      alt="QR code to open this parking session on your phone"
                      className="h-40 w-40 md:h-48 md:w-48"
                    />
                  </div>
                )}
                <p className="max-w-md text-center font-mono text-sm uppercase leading-relaxed text-grey-light">
                  SCAN ME WITH YOUR PHONE CAMERA TO VIEW OR EXTEND
                </p>

                <div className="w-full max-w-md">
                  <div className="h-3 w-full border border-grey-mid bg-grey-dark">
                    <div
                      className="h-full bg-warning transition-[width] duration-1000 ease-linear"
                      style={{
                        width: `${kioskCountdownProgress(guestSeconds, config.resetSeconds) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-center font-mono text-xs uppercase tracking-widest text-grey-light">
                    STARTS AGAIN IN {formatKioskCountdown(guestSeconds)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={resetGuest}
                  className="w-full max-w-md border border-white bg-white py-4 font-mono text-lg font-bold uppercase tracking-widest text-black"
                >
                  START AGAIN
                </button>
              </div>
            )
          ) : (
            <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
              <p className="shrink-0 text-center font-mono text-lg uppercase tracking-widest text-grey-light md:text-xl">
                ENTER YOUR NUMBER PLATE
              </p>

              <div className="flex shrink-0 justify-center gap-2" aria-live="polite">
                {guestSlots.map((char, index) => (
                  <div
                    key={index}
                    className={`flex h-20 w-14 items-center justify-center border-2 font-mono text-4xl font-bold tracking-wider md:h-24 md:w-20 md:text-5xl ${
                      char ? 'border-white text-white' : 'border-grey-mid text-grey-light/30'
                    }`}
                  >
                    {char || '_'}
                  </div>
                ))}
              </div>

              <div className="min-h-0 flex-1">
                <PlateKeypad
                  variant="kiosk"
                  compactNumpad
                  onKey={guestPress}
                  onBackspace={() => {
                    setGuestError('')
                    setGuestPlate((current) => removeLastPlateKey(current))
                  }}
                  onClear={() => {
                    setGuestError('')
                    setGuestPlate('')
                  }}
                  disabled={guestStage === 'submitting'}
                />
              </div>

              {guestError && (
                <p
                  className="shrink-0 text-center font-mono text-base text-danger"
                  role="alert"
                >
                  {guestError}
                </p>
              )}

              <button
                type="button"
                onClick={() => void submitGuest()}
                disabled={!guestPlate || guestStage === 'submitting'}
                className="shrink-0 border border-white bg-white py-6 font-mono text-2xl font-bold uppercase tracking-widest text-black disabled:opacity-30"
              >
                {guestStage === 'submitting'
                  ? 'REGISTERING…'
                  : `REGISTER ${config.durationMinutes} MINUTES`}
              </button>
            </div>
          )
        ) : fourStage === 'type' ? (
          <div className="flex w-full max-w-3xl flex-col gap-3">
            <p className="text-center font-mono text-base uppercase tracking-widest text-grey-light">
              CHOOSE YOUR PARKING
            </p>
            {config.fourHourTypes.length === 0 ? (
              <p className="text-center font-mono text-sm uppercase text-warning">
                NO 4 HOUR PARKING IS AVAILABLE — SPEAK WITH STAFF
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {config.fourHourTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => chooseType(type)}
                    className="border border-grey-mid bg-grey-dark/30 p-5 text-left active:border-white"
                  >
                    <p className="font-mono text-lg font-bold uppercase tracking-widest text-white">
                      {type.name}
                    </p>
                    <p className="mt-1 font-mono text-xs uppercase tracking-wider text-grey-light">
                      {type.windowLabel || `${type.durationMinutes} MINUTES`}
                    </p>
                    {type.health && !type.health.ok && !type.health.stale && (
                      <p className="mt-2 font-mono text-2xs uppercase text-warning">
                        SERVICE WARNING — {type.health.message}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : fourStage === 'credential' ? (
          <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
            <div className="shrink-0 text-center">
              <p className="font-mono text-base uppercase tracking-widest text-grey-light md:text-lg">
                {selectedType?.name}
              </p>
              <p className="mt-1 font-mono text-lg font-bold uppercase tracking-wider text-white md:text-xl">
                {adminMode ? 'ENTER ADMIN PIN' : 'ENTER YOUR MEMBERSHIP NUMBER'}
              </p>
            </div>
            <div className="flex shrink-0 justify-center" aria-live="polite">
              <div
                data-testid="credential-display"
                className={`flex min-h-20 w-full max-w-2xl items-center justify-center border-2 border-grey-mid px-4 py-4 font-mono text-3xl uppercase tracking-[0.3em] ${
                  adminMode || !credentialInput ? 'text-grey-light' : 'text-white'
                }`}
              >
                {adminMode ? 'PIN HIDDEN' : credentialInput || 'ENTER NUMBER'}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <PinKeypad
                variant="kiosk"
                tone={adminMode ? 'danger' : 'default'}
                onKey={(key) => {
                  setFourError('')
                  setCredentialInput((current) => appendDigit(current, key, adminMode ? 8 : 5))
                }}
                onBackspace={() => {
                  setFourError('')
                  setCredentialInput(removeLastDigit)
                }}
                onClear={() => {
                  setFourError('')
                  setCredentialInput('')
                }}
              />
            </div>
            {fourError && (
              <p
                className="shrink-0 text-center font-mono text-base text-danger"
                role="alert"
              >
                {fourError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void submitCredential()}
              disabled={credentialInput.length < (adminMode ? 4 : 2)}
              className="shrink-0 border border-white bg-white py-5 font-mono text-xl font-bold uppercase tracking-widest text-black disabled:opacity-30"
            >
              CONTINUE
            </button>
            <button
              type="button"
              onClick={() => {
                setFourError('')
                setFourStage('type')
              }}
              className="shrink-0 border border-grey-mid py-3 font-mono text-sm uppercase tracking-wider text-grey-light"
            >
              BACK
            </button>
          </div>
        ) : fourStage === 'member' && credential?.member ? (
          <div className="flex w-full max-w-2xl flex-col gap-3">
            <div className="text-center">
              <p className="font-mono text-base uppercase tracking-widest text-grey-light">
                {selectedType?.name}
              </p>
              <p className="mt-1 font-mono text-2xl font-bold uppercase tracking-widest text-white">
                HELLO {credential.member.firstName}
              </p>
              <p className="mt-1 font-mono text-sm uppercase tracking-wider text-grey-light">
                WHICH PLATE ARE YOU PARKING?
              </p>
            </div>
            <div className="space-y-2">
              {credential.member.plates.map((plate) => (
                <button
                  key={plate.id}
                  type="button"
                  onClick={() => memberUsesSaved(plate.plate)}
                  className={`flex w-full items-center justify-between border px-5 py-5 font-mono text-2xl tracking-[0.2em] ${
                    fourSelectedPlate === plate.plate
                      ? 'border-white bg-white text-black'
                      : 'border-grey-mid text-white'
                  }`}
                >
                  <span>{plate.plate}</span>
                  {plate.isDefault && <span className="text-xs uppercase">DEFAULT</span>}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={memberAddsNew}
              className="w-full border border-grey-mid py-4 font-mono text-sm uppercase tracking-wider text-grey-light"
            >
              + ADD A NEW PLATE
            </button>
            {fourError && (
              <p className="text-center font-mono text-base text-danger" role="alert">
                {fourError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void submitFourClaim(fourSelectedPlate)}
              disabled={!fourSelectedPlate}
              className="w-full border border-white bg-white py-5 font-mono text-xl font-bold uppercase tracking-widest text-black disabled:opacity-30"
            >
              CONFIRM PARKING
            </button>
            <button
              type="button"
              onClick={startAgainFromFour}
              className="w-full border border-grey-mid py-4 font-mono text-sm uppercase tracking-wider text-grey-light"
            >
              START AGAIN
            </button>
          </div>
        ) : fourStage === 'claiming' ? (
          <div className="text-center space-y-3">
            <p className="font-mono text-2xl font-bold uppercase tracking-widest text-white">
              STARTING PARKING…
            </p>
            <p className="font-mono text-sm uppercase tracking-wider text-grey-light">
              THIS CAN TAKE UP TO A MINUTE. PLEASE WAIT.
            </p>
          </div>
        ) : fourStage === 'ask' ? (
          <div className="flex w-full max-w-md flex-col gap-3 text-center">
            <p className="font-mono text-xl font-bold uppercase tracking-widest text-white">
              DID THE PARKING START?
            </p>
            <p className="font-mono text-sm uppercase text-grey-light">
              FINISH THE PARKING PAGE IN THE OTHER TAB, THEN ANSWER HERE.
            </p>
            {manualNote && <p className="font-mono text-xs text-danger">{manualNote}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void answerManual(true)}
                disabled={manualBusy}
                className="border border-white bg-white py-4 font-mono text-lg font-bold uppercase tracking-widest text-black disabled:opacity-40"
              >
                YES
              </button>
              <button
                type="button"
                onClick={() => void answerManual(false)}
                disabled={manualBusy}
                className="border border-grey-mid py-4 font-mono text-lg font-bold uppercase tracking-widest text-white disabled:opacity-40"
              >
                NO / NOT YET
              </button>
            </div>
            <button
              type="button"
              onClick={() => setFourStage('result')}
              className="border border-grey-mid py-3 font-mono text-xs uppercase tracking-wider text-grey-light"
            >
              BACK
            </button>
          </div>
        ) : fourStage === 'result' && fourResult ? (
          <div className="flex w-full max-w-3xl flex-col items-center gap-3" aria-live="polite">
            <p
              className={`text-center font-mono text-2xl font-bold uppercase tracking-widest md:text-3xl ${fourTone(
                fourResult,
              )}`}
            >
              {fourTitle(fourResult)}
            </p>
            <p className="font-mono text-4xl font-bold tracking-[0.35em] text-white md:text-5xl">
              {fourResult.plate}
            </p>
            {fourResult.memberName && (
              <p className="font-mono text-xs uppercase tracking-wider text-grey-light">
                {fourResult.memberName}
              </p>
            )}
            {fourResult.typeName && (
              <p className="font-mono text-xs uppercase tracking-wider text-grey-light">
                {fourResult.typeName}
              </p>
            )}

            {(fourResult.status === 'CONFIRMED' ||
              fourResult.status === 'ALREADY_CLAIMED') && (
              <div className="space-y-1 text-center">
                {fourResult.validFrom && (
                  <p className="font-mono text-sm uppercase tracking-wider text-white">
                    VALID FROM <span className="font-bold">{fourResult.validFrom}</span>
                  </p>
                )}
                {fourResult.validUntil && (
                  <p className="font-mono text-lg uppercase tracking-wider text-white">
                    VALID UNTIL <span className="font-bold text-success">{fourResult.validUntil}</span>
                  </p>
                )}
                {(fourResult.locations?.length ?? 0) > 0 && (
                  <p className="font-mono text-xs uppercase tracking-wider text-grey-light">
                    PARK IN {fourResult.locations?.join(' · ')}
                  </p>
                )}
              </div>
            )}

            {fourResult.status === 'FAILED' && (
              <p className="max-w-lg text-center font-mono text-sm uppercase leading-relaxed text-danger">
                {fourResult.message || 'PLEASE SPEAK WITH STAFF'}
              </p>
            )}
            {fourResult.status === 'CAPTCHA_BLOCKED' && (
              <p className="max-w-lg text-center font-mono text-sm uppercase leading-relaxed text-danger">
                {fourResult.message || 'THE PARKING SITE BLOCKED THE AUTOMATIC START'}
              </p>
            )}
            {fourResult.status === 'EXHAUSTED' && (
              <p className="max-w-lg text-center font-mono text-sm uppercase leading-relaxed text-warning">
                {fourResult.message || 'NO PARKING SESSIONS ARE AVAILABLE'}
              </p>
            )}
            {(fourResult.status === 'MANUAL_CONFIRMED' ||
              fourResult.status === 'MANUAL_UNCONFIRMED') && (
              <p className="max-w-lg text-center font-mono text-sm uppercase leading-relaxed text-grey-light">
                {fourResult.message}
              </p>
            )}

            {(fourResult.status === 'CONFIRMED' ||
              fourResult.status === 'ALREADY_CLAIMED') && (
              <div className="w-full max-w-md">
                <div className="h-3 w-full border border-grey-mid bg-grey-dark">
                  <div
                    className="h-full bg-warning transition-[width] duration-1000 ease-linear"
                    style={{
                      width: `${kioskCountdownProgress(fourSeconds, config.resetSeconds) * 100}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-center font-mono text-xs uppercase tracking-widest text-grey-light">
                  STARTS AGAIN IN {formatKioskCountdown(fourSeconds)}
                </p>
              </div>
            )}

            {fourResult.fallbackUrl && fourResult.status !== 'EXHAUSTED' && (
              <button
                type="button"
                onClick={() => void openFallback()}
                disabled={manualBusy}
                className="w-full max-w-md border border-white bg-white py-4 font-mono text-lg font-bold uppercase tracking-widest text-black disabled:opacity-40"
              >
                OPEN PARKING PAGE
              </button>
            )}

            {(fourResult.status === 'FAILED' ||
              fourResult.status === 'CAPTCHA_BLOCKED' ||
              fourResult.status === 'MANUAL_UNCONFIRMED') && (
              <button
                type="button"
                onClick={() => {
                  setFourResult(null)
                  setFourStage(
                    credential?.member && credential.member.plates.length > 0
                      ? 'member'
                      : 'plate',
                  )
                }}
                className="w-full max-w-md border border-grey-mid py-3 font-mono text-xs uppercase tracking-wider text-grey-light"
              >
                TRY AGAIN
              </button>
            )}

            <button
              type="button"
              onClick={startAgainFromFour}
              className="w-full max-w-2xl border border-white bg-white py-5 font-mono text-xl font-bold uppercase tracking-widest text-black"
            >
              START AGAIN
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
            <div className="shrink-0 text-center">
              <p className="font-mono text-base uppercase tracking-widest text-grey-light md:text-lg">
                {selectedType?.name}
              </p>
              <p className="mt-1 font-mono text-lg font-bold uppercase tracking-widest text-white md:text-xl">
                {credential?.member
                  ? credential.member.plates.length === 0
                    ? 'FIRST TIME — ADD YOUR PLATE'
                    : 'ADD A NEW PLATE'
                  : 'ENTER YOUR NUMBER PLATE'}
              </p>
            </div>
            <div className="flex shrink-0 justify-center gap-2" aria-live="polite">
              {fourSlots.map((char, index) => (
                <div
                  key={index}
                  className={`flex h-20 w-14 items-center justify-center border-2 font-mono text-4xl font-bold tracking-wider md:h-24 md:w-20 md:text-5xl ${
                    char ? 'border-white text-white' : 'border-grey-mid text-grey-light/30'
                  }`}
                >
                  {char || '_'}
                </div>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              <PlateKeypad
                variant="kiosk"
                onKey={(key) => {
                  setFourError('')
                  setFourPlate((current) => appendPlateKey(current, key))
                }}
                onBackspace={() => {
                  setFourError('')
                  setFourPlate((current) => removeLastPlateKey(current))
                }}
                onClear={() => {
                  setFourError('')
                  setFourPlate('')
                }}
              />
            </div>
            {fourError && (
              <p
                className="shrink-0 text-center font-mono text-base text-danger"
                role="alert"
              >
                {fourError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void submitFourClaim(fourPlate)}
              disabled={!fourPlate}
              className="shrink-0 border border-white bg-white py-6 font-mono text-2xl font-bold uppercase tracking-widest text-black disabled:opacity-30"
            >
              CONFIRM PARKING
            </button>
            <button
              type="button"
              onClick={backFromPlate}
              className="shrink-0 border border-grey-mid py-4 font-mono text-sm uppercase tracking-wider text-grey-light"
            >
              BACK
            </button>
          </div>
        )}
      </main>

      <footer
        className={`shrink-0 border-t p-3 ${
          adminMode ? 'border-danger/60' : 'border-grey-mid'
        }`}
      >
        <button
          type="button"
          onPointerDown={startHold}
          onPointerUp={stopHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          className={`w-full select-none border py-4 font-mono text-base font-semibold uppercase tracking-widest ${
            adminMode ? 'border-danger/60 text-danger' : 'border-grey-mid text-white'
          }`}
          aria-label={HOLD_LABEL}
        >
          {HOLD_LABEL}
        </button>
      </footer>
    </div>
  )
}
