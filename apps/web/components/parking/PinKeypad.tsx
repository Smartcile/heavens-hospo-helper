'use client'

interface PinKeypadProps {
  onKey: (key: string) => void
  onBackspace: () => void
  onClear: () => void
  disabled?: boolean
  variant?: 'default' | 'kiosk'
  tone?: 'default' | 'danger'
}

const ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
]

// Numeric keypad for membership numbers / PINs. Same styling as the plate
// keypad so the two screens feel like one device. `kiosk` fills the screen for
// older users; `danger` is the hidden admin-PIN mode.
export function PinKeypad({
  onKey,
  onBackspace,
  onClear,
  disabled,
  variant = 'default',
  tone = 'default',
}: PinKeypadProps) {
  const kiosk = variant === 'kiosk'
  const danger = tone === 'danger'
  const keyClass = kiosk
    ? `h-14 min-h-14 w-full select-none border font-mono text-3xl md:h-full md:text-4xl font-semibold transition-colors disabled:opacity-40 ${
        danger
          ? 'border-danger/60 bg-danger/15 text-white active:bg-white active:text-black'
          : 'border-grey-mid bg-grey-dark/40 text-white active:bg-white active:text-black'
      }`
    : 'h-12 md:h-14 select-none border border-grey-mid bg-grey-dark/40 font-mono text-xl md:text-2xl font-semibold text-white transition-colors active:bg-white active:text-black disabled:opacity-40'
  const editClass = kiosk
    ? `h-14 min-h-14 w-full select-none border font-mono text-base md:h-full md:text-xl font-semibold uppercase tracking-wider transition-colors disabled:opacity-40 ${
        danger
          ? 'border-danger/60 text-danger active:bg-white active:text-black'
          : 'border-grey-mid text-grey-light active:bg-white active:text-black'
      }`
    : 'h-12 md:h-14 select-none border border-grey-mid font-mono text-sm font-semibold uppercase tracking-wider text-grey-light active:bg-white active:text-black disabled:opacity-40'
  const backClass = kiosk
    ? `h-14 min-h-14 w-full select-none border font-mono text-xl md:h-full md:text-2xl font-semibold uppercase tracking-wider transition-colors disabled:opacity-40 ${
        danger
          ? 'border-danger/60 text-white active:bg-white active:text-black'
          : 'border-grey-mid text-white active:bg-white active:text-black'
      }`
    : 'h-12 md:h-14 select-none border border-grey-mid font-mono text-lg font-semibold uppercase tracking-wider text-white active:bg-white active:text-black disabled:opacity-40'

  return (
    <div
      className={
        kiosk
          ? 'mx-auto flex h-auto min-h-0 w-full flex-col gap-1 md:h-full'
          : 'mx-auto w-full max-w-md space-y-1.5'
      }
      aria-label="Number keypad"
    >
      {ROWS.map((row) => (
        <div
          key={row[0]}
          className={
            kiosk ? 'grid min-h-0 flex-1 grid-cols-3 gap-1' : 'grid grid-cols-3 gap-1.5'
          }
        >
          {row.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onKey(key)}
              disabled={disabled}
              className={keyClass}
              aria-label={key}
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      <div
        className={
          kiosk ? 'grid min-h-0 flex-1 grid-cols-3 gap-1' : 'grid grid-cols-3 gap-1.5'
        }
      >
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className={editClass}
        >
          CLEAR
        </button>
        <button
          type="button"
          onClick={() => onKey('0')}
          disabled={disabled}
          className={keyClass}
          aria-label="0"
        >
          0
        </button>
        <button
          type="button"
          onClick={onBackspace}
          disabled={disabled}
          className={backClass}
          aria-label="Delete last digit"
        >
          DEL
        </button>
      </div>
    </div>
  )
}
