// In-process mutex keyed by string. Booking creation must be serialised per
// venue+service+date: two WooCommerce webhooks arriving at once would otherwise
// both read an empty occupancy set and seat the same table. The deploy is a
// single Next.js instance, so a process-local lock is sufficient.

const locks = new Map<string, Promise<void>>()

export async function withSeatLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>((r) => (release = r))
  const chain = prev.then(() => next)
  locks.set(key, chain)
  await prev
  try {
    return await fn()
  } finally {
    release()
    if (locks.get(key) === chain) locks.delete(key)
  }
}
