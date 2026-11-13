'use client'

const LETTER_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
]

interface PlateKeypadProps {
  onKey: (key: string) => void
  onBackspace: () => void
  onClear: () => void
  disabled?: boolean
}

// On-screen keypad. Deliberately not an <input>: the iPad never raises the
// native keyboard, so there is no autocorrect and the layout never jumps.
export function PlateKeypad({ onKey, onBackspace, onClear, disabled }: PlateKeypadProps) {
  const keyClass =
    'h-12 md:h-14 select-none border border-grey-mid bg-grey-dark/40 font-mono text-lg md:text-xl font-semibold text-white transition-colors active:bg-white active:text-black disabled:opacity-40'

  return (
    <div className="w-full space-y-1.5" aria-label="Number plate keypad">
      {LETTER_ROWS.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
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
      <div className="grid grid-cols-2 gap-1.5 pt-1">
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
          onClick={onBackspace}
          disabled={disabled}
          className="h-12 md:h-14 select-none border border-grey-mid font-mono text-lg font-semibold uppercase tracking-wider text-white active:bg-white active:text-black disabled:opacity-40"
          aria-label="Delete last character"
        >
          ⌫
        </button>
      </div>
    </div>
  )
}
