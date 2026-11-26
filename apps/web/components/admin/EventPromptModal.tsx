'use client'

// The BEO copy-paste LLM loop: pick a mode, paste the customer message, copy the
// prompt into any external model, paste the answer back, review a diff, then
// APPLY. Nothing is sent anywhere and nothing changes until APPLY.

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { type BlockLibrary } from '@/lib/beo-blocks'
import {
  awaitingFromBlocks,
  buildEventPrompt,
  diffEventPatch,
  EVENT_PROMPT_MODES,
  parseEventAnswer,
  type AwaitingItem,
  type EventPromptEvent,
  type EventPromptMode,
  type EventPromptPatch,
  type EventPromptRefs,
  type ParsedEventAnswer,
  type PromptBlock,
} from '@/lib/event-prompt'

export interface PromptBlockRow {
  id: string
  type: string
  title: string | null
  config: Record<string, unknown>
  sortOrder: number
}

export interface EventPromptApply {
  patch: EventPromptPatch
  blocks: PromptBlockRow[] | null
  summary: string
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `new_${crypto.randomUUID()}`
  }
  return `new_${Math.random().toString(36).slice(2)}`
}

/** The app's reserved (`__`-prefixed) working keys, e.g. `__state`. */
function reservedKeys(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config ?? {})) {
    if (key.startsWith('__')) out[key] = value
  }
  return out
}

/**
 * Turn a parsed answer into the next block list, preserving existing ids by
 * type so a reorder does not churn rows. Returns null when the answer does not
 * touch blocks.
 */
export function mergeParsedBlocks(
  current: PromptBlockRow[],
  parsed: ParsedEventAnswer,
): PromptBlockRow[] | null {
  if (parsed.blocks === null && parsed.awaiting === null) return null

  const source: PromptBlock[] =
    parsed.blocks !== null
      ? parsed.blocks
      : current.map((b) => ({ type: b.type, title: b.title, config: b.config }))

  const idsByType = new Map<string, string[]>()
  for (const b of current) {
    const list = idsByType.get(b.type) ?? []
    list.push(b.id)
    idsByType.set(b.type, list)
  }

  const existingAwaiting = current.find((b) => b.type === 'AWAITING')
  const next: PromptBlockRow[] = []

  for (const b of source) {
    if (b.type === 'AWAITING') continue
    const ids = idsByType.get(b.type)
    const id = ids && ids.length > 0 ? (ids.shift() as string) : newId()
    const existing = current.find((c) => c.id === id)
    next.push({
      id,
      type: b.type,
      title: b.title?.trim() || null,
      // The parser strips `__` keys from the answer. Carry the existing block's
      // reserved keys forward so APPLY never resets __state (or any future key).
      config: { ...(b.config ?? {}), ...reservedKeys(existing?.config) },
      sortOrder: next.length,
    })
  }

  const awaiting: AwaitingItem[] =
    parsed.awaiting !== null ? parsed.awaiting : awaitingFromBlocks(source)
  if (awaiting.length > 0) {
    next.push({
      id: existingAwaiting?.id ?? newId(),
      type: 'AWAITING',
      title: existingAwaiting?.title ?? null,
      config: {
        ...reservedKeys(existingAwaiting?.config),
        rows: awaiting.map((a) => ({ label: a.label, since: a.since ?? '' })),
      },
      sortOrder: next.length,
    })
  }

  return next.map((b, i) => ({ ...b, sortOrder: i }))
}

const textareaClass =
  'w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light'

export function EventPromptModal({
  isOpen,
  onClose,
  event,
  blocks,
  refs,
  library,
  onApply,
}: {
  isOpen: boolean
  onClose: () => void
  event: EventPromptEvent
  blocks: PromptBlockRow[]
  refs: EventPromptRefs
  library: BlockLibrary
  onApply: (result: EventPromptApply) => Promise<boolean> | boolean
}) {
  const [mode, setMode] = useState<EventPromptMode>('BEO')
  const [message, setMessage] = useState('')
  const [answer, setAnswer] = useState('')
  const [parsed, setParsed] = useState<ParsedEventAnswer | null>(null)
  const [copied, setCopied] = useState('')
  const [applying, setApplying] = useState(false)

  const currentBlocks = blocks

  const promptEvent = useMemo<EventPromptEvent>(() => ({ ...event, blocks }), [event, blocks])
  const prompt = useMemo(
    () => buildEventPrompt(promptEvent, refs, { mode, customerMessage: message }),
    [promptEvent, refs, mode, message],
  )

  const nextBlocks = useMemo(
    () => (parsed ? mergeParsedBlocks(currentBlocks, parsed) : null),
    [parsed, currentBlocks],
  )

  const diffs = useMemo(
    () =>
      parsed
        ? diffEventPatch(
            event as unknown as Record<string, unknown>,
            parsed.patch,
            currentBlocks,
            nextBlocks ?? currentBlocks,
          )
        : [],
    [parsed, event, currentBlocks, nextBlocks],
  )

  const hasError = !!parsed?.issues.some((i) => i.severity === 'ERROR')
  const canApply = !!parsed && !hasError && diffs.length > 0 && !applying

  async function copyPrompt() {
    try {
      await navigator.clipboard?.writeText(prompt)
      setCopied('PROMPT COPIED — PASTE IT INTO YOUR LLM')
    } catch {
      setCopied('COPY FAILED — SELECT THE PROMPT AND COPY IT MANUALLY')
    }
  }

  async function copyReply() {
    if (!parsed?.reply) return
    try {
      await navigator.clipboard?.writeText(parsed.reply as string)
      setCopied('REPLY COPIED')
    } catch {
      setCopied('COPY FAILED')
    }
  }

  function preview() {
    setCopied('')
    setParsed(parseEventAnswer(answer, library))
  }

  async function apply() {
    if (!parsed) return
    setApplying(true)
    const fields = diffs.filter((d) => d.kind === 'FIELD').length
    const blocks = diffs.filter((d) => d.kind === 'BLOCK').length
    const summary = `LLM_PASTE — ${fields} FIELD(S), ${blocks} BLOCK(S)`
    let ok = false
    try {
      ok = await onApply({ patch: parsed.patch, blocks: nextBlocks, summary })
    } finally {
      setApplying(false)
    }
    if (ok) onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="PROMPT / PASTE ANSWER" size="lg">
      <div className="space-y-3" data-testid="event-prompt-modal">
        <p className="font-mono text-xs uppercase text-grey-light">
          COPY THE PROMPT INTO YOUR OWN LLM, THEN PASTE THE JSON ANSWER BACK. NOTHING CHANGES UNTIL APPLY.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            label="Mode"
            value={mode}
            options={EVENT_PROMPT_MODES.map((m) => ({ value: m, label: m }))}
            onChange={(e) => {
              setMode(e.target.value as EventPromptMode)
              setParsed(null)
            }}
          />
          <div className="flex items-end">
            <Button size="sm" variant="ghost" onClick={copyPrompt}>COPY PROMPT</Button>
          </div>
        </div>

        <div>
          <label className="block font-mono text-xs uppercase text-grey-light mb-1">Customer message</label>
          <textarea
            rows={3}
            value={message}
            placeholder="PASTE THE CUSTOMER'S EMAIL OR MESSAGE HERE"
            onChange={(e) => setMessage(e.target.value)}
            className={textareaClass}
          />
        </div>

        <details className="border border-grey-mid">
          <summary className="px-2 py-1.5 font-mono text-xs uppercase text-grey-light cursor-pointer">
            VIEW PROMPT ({prompt.length} CHARS)
          </summary>
          <pre className="p-2 max-h-60 overflow-auto font-mono text-2xs text-white whitespace-pre-wrap break-words">
            {prompt}
          </pre>
        </details>

        <div>
          <label className="block font-mono text-xs uppercase text-grey-light mb-1">Paste the answer</label>
          <textarea
            rows={6}
            value={answer}
            placeholder='PASTE THE ```json BLOCK HERE'
            onChange={(e) => {
              setAnswer(e.target.value)
              setParsed(null)
            }}
            className={textareaClass}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={preview} disabled={!answer.trim()}>PREVIEW DIFF</Button>
          {copied && <span className="font-mono text-xs uppercase text-accent">{copied}</span>}
        </div>

        {parsed && (
          <div className="space-y-2">
            {parsed.issues.length > 0 && (
              <div className="border border-grey-mid p-2 space-y-1">
                {parsed.issues.map((issue, i) => (
                  <p
                    key={i}
                    className={`font-mono text-xs uppercase ${issue.severity === 'ERROR' ? 'text-danger' : 'text-warning'}`}
                  >
                    [{issue.severity}] {issue.message}
                  </p>
                ))}
              </div>
            )}

            {parsed.reply && (
              <div className="border border-grey-mid p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase text-grey-light">DRAFT REPLY</span>
                  <Button size="sm" variant="ghost" onClick={copyReply}>COPY REPLY</Button>
                </div>
                <p className="font-mono text-xs text-white whitespace-pre-wrap">{parsed.reply}</p>
              </div>
            )}

            <div className="border border-grey-mid">
              <div className="px-2 py-1.5 border-b border-grey-mid bg-grey-dark/40 font-mono text-xs uppercase text-grey-light tracking-wider">
                CHANGES — {diffs.length}
              </div>
              {diffs.length === 0 ? (
                <p className="p-2 font-mono text-xs uppercase text-grey-light">NO CHANGES.</p>
              ) : (
                <div className="divide-y divide-grey-mid">
                  {diffs.map((d) => (
                    <div key={`${d.kind}-${d.key}`} className="px-2 py-1.5 font-mono text-xs text-white">
                      <div className="text-grey-light uppercase">{d.label}</div>
                      <div className="break-words"><span className="text-danger line-through">{d.oldValue}</span> → <span className="text-success">{d.newValue}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={onClose}>CANCEL</Button>
          <Button size="sm" onClick={apply} loading={applying} disabled={!canApply}>APPLY</Button>
        </div>
      </div>
    </Modal>
  )
}
