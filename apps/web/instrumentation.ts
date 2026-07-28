// Next.js server-startup hook (experimental.instrumentationHook).
// Starts the internal cron scheduler once per server process.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startInternalCron } = await import('@/lib/internal-cron')
    startInternalCron()
  }
}
