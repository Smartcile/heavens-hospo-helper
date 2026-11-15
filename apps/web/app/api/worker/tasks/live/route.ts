import { NextResponse, type NextRequest } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { getTaskLiveHub } from '@/lib/task-live.server'

// Long-lived streaming response: Node runtime (Prisma), no caching, no
// static optimisation. Proxies must not buffer it (X-Accel-Buffering: no) and
// the heartbeat stays well under Cloudflare's 100 s idle timeout.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const HEARTBEAT_MS = 15_000

export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hub = getTaskLiveHub()
  const encoder = new TextEncoder()

  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null
  let unsubscribe: (() => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let closed = false

  const cleanup = () => {
    if (closed) return
    closed = true

    if (heartbeat !== null) {
      clearInterval(heartbeat)
      heartbeat = null
    }
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    req.signal.removeEventListener('abort', cleanup)
    try {
      controllerRef?.close()
    } catch {
      // Already closed/cancelled — nothing to do.
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller

      const send = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }

      // Flush headers immediately so a proxy sees an open event stream.
      send(': connected\n\n')
      // Rare early-cancel race: the send above may have failed and cleaned up.
      if (closed) return

      unsubscribe = hub.subscribe(session.venueId, (revision) => {
        send(`event: change\ndata: ${revision}\n\n`)
      })

      // One baseline change so a change landing between the client's initial
      // load() and the first hub poll is still caught.
      send('event: change\ndata: baseline\n\n')
      if (closed) return

      heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS)
      ;(heartbeat as { unref?: () => void }).unref?.()

      req.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
