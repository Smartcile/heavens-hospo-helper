'use client'

interface PinKeypadProps {
  onKey: (key: string) => void
  onBackspace: () => void
  onClear: () => void
  disabled?: boolean
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
]

// Numeric keypad for membership numbers / PINs. Same styling as the plate
// keypad so the two screens feel like one device.
export function PinKeypad({ onKey, onBackspace, onClear, disabled }: PinKeypadProps) {
  const keyClass =
    'h-12 md:h-14 select-none border border-grey-mid bg-grey-dark/40 font-mono text-xl md:text-2xl font-semibold text-white transition-colors active:bg-white active:text-black disabled:opacity-40'

  return (
    <div className="mx-auto w-full max-w-md space-y-1.5" aria-label="Number keypad">
      {ROWS.map((row) => (
        <div key={row[0]} className="grid grid-cols-3 gap-1.5">
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
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="h-12 md:h-14 select-none border border-grey-mid font-mono text-sm font-semibold uppercase tracking-wider text-grey-light active:bg-white active:text-black disabled:opacity-40"
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
          className="h-12 md:h-14 select-none border border-grey-mid font-mono text-lg font-semibold uppercase tracking-wider text-white active:bg-white active:text-black disabled:opacity-40"
          aria-label="Delete last digit"
        >
          DEL
        </button>
      </div>
    </div>
  )
}
