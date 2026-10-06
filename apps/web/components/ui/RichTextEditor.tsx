'use client'

import { useEffect, useRef, useState } from 'react'
import { isRichTextEmpty, sanitiseRichText } from '@/lib/rich-text'

// A small, dependency-free "word-style" editor for guide document bodies:
// headings, paragraphs, bold/italic/underline, lists. Content is stored as
// sanitised HTML. `document.execCommand` is deprecated but is the pragmatic
// choice here — it needs no package and the output is scrubbed by the pure
// sanitiser on blur and again on the server.

function runExec(command: string, arg?: string) {
  try {
    if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
      document.execCommand(command, false, arg)
    }
  } catch {
    // Unsupported (e.g. jsdom) — the toolbar is a no-op rather than a crash.
  }
}

const BLOCKS: { label: string; arg: string }[] = [
  { label: 'H1', arg: 'h1' },
  { label: 'H2', arg: 'h2' },
  { label: 'H3', arg: 'h3' },
  { label: 'P', arg: 'p' },
]

const BTN = 'font-mono text-xs uppercase px-2 py-1 border border-grey-mid text-grey-light hover:border-white hover:text-white transition-colors'

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)

  // Seed the DOM once and re-seed only when the value changes from outside.
  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== (value ?? '')) el.innerHTML = value ?? ''
  }, [value])

  useEffect(() => {
    runExec('defaultParagraphSeparator', 'p')
  }, [])

  function emit() {
    onChange(ref.current?.innerHTML ?? '')
  }

  function exec(command: string, arg?: string) {
    if (disabled) return
    ref.current?.focus()
    runExec(command, arg)
    emit()
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (disabled) return
    e.preventDefault()
    const html = e.clipboardData?.getData('text/html') ?? ''
    const text = e.clipboardData?.getData('text/plain') ?? ''
    const clean = html ? sanitiseRichText(html) : ''
    if (clean) runExec('insertHTML', clean)
    else runExec('insertText', text)
    emit()
  }

  const showPlaceholder = !focused && (!value || isRichTextEmpty(value))

  return (
    <div className={`border bg-black ${focused ? 'border-white' : 'border-grey-mid'}`}>
      <div className="flex flex-wrap items-center gap-1 border-b border-grey-mid p-1">
        {BLOCKS.map((b) => (
          <button key={b.arg} type="button" disabled={disabled} onClick={() => exec('formatBlock', b.arg)} className={BTN}>
            {b.label}
          </button>
        ))}
        <span className="w-px self-stretch bg-grey-mid mx-1" />
        <button type="button" disabled={disabled} onClick={() => exec('bold')} className={BTN}><strong>B</strong></button>
        <button type="button" disabled={disabled} onClick={() => exec('italic')} className={BTN}><em>I</em></button>
        <button type="button" disabled={disabled} onClick={() => exec('underline')} className={BTN}><u>U</u></button>
        <span className="w-px self-stretch bg-grey-mid mx-1" />
        <button type="button" disabled={disabled} onClick={() => exec('insertUnorderedList')} className={BTN}>• LIST</button>
        <button type="button" disabled={disabled} onClick={() => exec('insertOrderedList')} className={BTN}>1. LIST</button>
        <button type="button" disabled={disabled} onClick={() => exec('removeFormat')} className={BTN}>CLEAR</button>
      </div>

      <div className="relative">
        {showPlaceholder && placeholder && (
          <span className="pointer-events-none absolute left-3 top-2 font-sans text-sm text-grey-light">{placeholder}</span>
        )}
        <div
          ref={ref}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emit}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            // Normalise once the user leaves the field.
            const clean = sanitiseRichText(ref.current?.innerHTML ?? '')
            if (ref.current && ref.current.innerHTML !== clean) ref.current.innerHTML = clean
            onChange(clean)
          }}
          onPaste={onPaste}
          className="min-h-[140px] px-3 py-2 font-sans text-sm text-white outline-none [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_a]:underline"
        />
      </div>
    </div>
  )
}
