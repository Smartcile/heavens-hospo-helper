'use client'

const LETTER_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
]

// 3x3 numpad with 0 across the bottom. The separators (space/hyphen) are never
// part of a plate, so they are not offered.
const NUM_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
]

interface PlateKeypadProps {
  onKey: (key: string) => void
  onBackspace: () => void
  onClear: () => void
  disabled?: boolean
  variant?: 'default' | 'kiosk'
}

// On-screen keypad: QWERTY letters on the left, a numpad on the right. Not an
// <input>, so the iPad never raises the native keyboard or autocorrect.
// `kiosk` stretches the keys to fill the screen for older users.
export function PlateKeypad({
  onKey,
  onBackspace,
  onClear,
  disabled,
  variant = 'default',
}: PlateKeypadProps) {
  const kiosk = variant === 'kiosk'
  const keyClass = kiosk
    ? 'h-full min-h-14 w-full select-none border border-grey-mid bg-grey-dark/40 font-mono text-2xl md:text-3xl font-semibold text-white transition-colors active:bg-white active:text-black disabled:opacity-40'
    : 'h-11 md:h-14 select-none border border-grey-mid bg-grey-dark/40 font-mono text-base md:text-xl font-semibold text-white transition-colors active:bg-white active:text-black disabled:opacity-40'
  const editClass = kiosk
    ? 'h-full min-h-14 w-full select-none border border-grey-mid font-mono text-base md:text-xl font-semibold uppercase tracking-wider text-grey-light active:bg-white active:text-black disabled:opacity-40'
    : 'h-11 md:h-14 select-none border border-grey-mid font-mono text-sm font-semibold uppercase tracking-wider text-grey-light active:bg-white active:text-black disabled:opacity-40'
  const backClass = kiosk
    ? 'h-full min-h-14 w-full select-none border border-grey-mid font-mono text-xl md:text-2xl font-semibold uppercase tracking-wider text-white active:bg-white active:text-black disabled:opacity-40'
    : 'h-11 md:h-14 select-none border border-grey-mid font-mono text-lg font-semibold uppercase tracking-wider text-white active:bg-white active:text-black disabled:opacity-40'

  return (
    <div
      className={`grid w-full grid-cols-1 ${
        kiosk ? 'h-full min-h-0 gap-1' : 'gap-2'
      } md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`}
      aria-label="Number plate keypad"
    >
      <div className={kiosk ? 'flex min-h-0 flex-col gap-1' : 'space-y-1.5'}>
        {LETTER_ROWS.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={`grid min-h-0 gap-1.5 ${kiosk ? 'flex-1 gap-1' : ''}`}
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
        <div className={`grid grid-cols-2 gap-1.5 ${kiosk ? 'flex-1 gap-1' : ''}`}>
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
            onClick={onBackspace}
            disabled={disabled}
            className={backClass}
            aria-label="Delete last character"
          >
            DEL
          </button>
        </div>
      </div>

      <div
        className={
          kiosk
            ? 'grid min-h-0 grid-cols-3 grid-rows-4 gap-1'
            : 'grid grid-cols-3 content-start gap-1.5'
        }
      >
        {NUM_ROWS.flat().map((key) => (
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
        <button
          type="button"
          onClick={() => onKey('0')}
          disabled={disabled}
          className={`${keyClass} col-span-3`}
          aria-label="0"
        >
          0
        </button>
      </div>
    </div>
  )
}
