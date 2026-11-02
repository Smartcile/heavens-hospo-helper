/*
 * Customer identity matching.
 *
 * The same person reaches us through WooCommerce checkout, a phone booking, and
 * the bookings form — usually with slightly different spelling and formatting.
 * These helpers reduce a contact to stable keys and decide whether an incoming
 * contact is someone we already know.
 *
 * The matching rules are deliberately conservative. A duplicate customer is a
 * mild annoyance; a wrong merge silently attributes one person's orders and
 * allergies to another, and is very hard to unpick after the fact.
 */

export interface CustomerIdentity {
  name?: string | null
  email?: string | null
  phone?: string | null
}

export interface CustomerKeys {
  name: string
  emailKey: string | null
  phoneKey: string | null
}

/** Minimal shape a stored customer needs for matching. */
export interface MatchCandidate {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  emailKey?: string | null
  phoneKey?: string | null
}

export function normaliseEmail(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()
  // Require something that at least looks like an address — junk such as "n/a"
  // must not become a match key, or every junk entry collapses into one person.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null
  return trimmed
}

/*
 * Phone keys are digits only, with the NZ country code folded back to the
 * national format so "+64 21 555 1234" and "021 555 1234" match. NZ national
 * numbers always start with 0, so a leading 64 is unambiguously a country code.
 */
export function normalisePhone(value: string | null | undefined): string | null {
  if (!value) return null
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('0064')) digits = `0${digits.slice(4)}`
  else if (digits.startsWith('64') && digits.length > 9) digits = `0${digits.slice(2)}`
  // Too short to identify anyone — treat as absent rather than match on it.
  if (digits.length < 6) return null
  return digits
}

export function buildCustomerKeys(input: CustomerIdentity): CustomerKeys {
  return {
    name: (input.name ?? '').toUpperCase().trim(),
    emailKey: normaliseEmail(input.email),
    phoneKey: normalisePhone(input.phone),
  }
}

/*
 * Precedence: email, then phone, then name.
 *
 * Name is only consulted when the incoming contact has neither an email nor a
 * phone. If they gave us an email that matched nobody, they are a new person —
 * falling through to a name match there is how "JOHN SMITH" swallows every
 * other John Smith.
 */
export function findMatch<T extends MatchCandidate>(
  keys: CustomerKeys,
  candidates: T[],
): T | null {
  if (keys.emailKey) {
    const byEmail = candidates.find((c) => c.emailKey && c.emailKey === keys.emailKey)
    if (byEmail) return byEmail
  }

  if (keys.phoneKey) {
    const byPhone = candidates.find((c) => c.phoneKey && c.phoneKey === keys.phoneKey)
    if (byPhone) return byPhone
  }

  if (!keys.emailKey && !keys.phoneKey && keys.name) {
    const byName = candidates.find((c) => c.name.toUpperCase().trim() === keys.name)
    if (byName) return byName
  }

  return null
}

/*
 * Fields worth copying onto a matched customer. Only fills blanks — an incoming
 * order never overwrites contact details we already hold, because the newer
 * value is not automatically the better one (guest checkouts are often typos).
 */
export function fieldsToEnrich(
  existing: MatchCandidate,
  keys: CustomerKeys,
  identity: CustomerIdentity,
): { email?: string; emailKey?: string; phone?: string; phoneKey?: string } {
  const patch: { email?: string; emailKey?: string; phone?: string; phoneKey?: string } = {}

  if (!existing.emailKey && keys.emailKey && identity.email) {
    patch.email = identity.email.trim()
    patch.emailKey = keys.emailKey
  }
  if (!existing.phoneKey && keys.phoneKey && identity.phone) {
    patch.phone = identity.phone.trim()
    patch.phoneKey = keys.phoneKey
  }

  return patch
}

/** Just enough of the Prisma client for `resolveCustomer` to be testable. */
interface CustomerClient {
  customer: {
    findMany(args: unknown): Promise<MatchCandidate[]>
    create(args: unknown): Promise<{ id: string }>
    update(args: unknown): Promise<unknown>
  }
}

/*
 * Find-or-create the customer for an incoming contact, enriching blanks on a
 * match. Returns null when there is nothing identifiable to store at all.
 */
export async function resolveCustomer(
  client: CustomerClient,
  venueId: string,
  identity: CustomerIdentity,
): Promise<string | null> {
  const keys = buildCustomerKeys(identity)
  if (!keys.name && !keys.emailKey && !keys.phoneKey) return null

  const or: Record<string, string>[] = []
  if (keys.emailKey) or.push({ emailKey: keys.emailKey })
  if (keys.phoneKey) or.push({ phoneKey: keys.phoneKey })
  if (!keys.emailKey && !keys.phoneKey) or.push({ name: keys.name })

  const candidates = await client.customer.findMany({
    where: { venueId, deletedAt: null, OR: or },
  })

  const match = findMatch(keys, candidates)

  if (match) {
    const patch = fieldsToEnrich(match, keys, identity)
    if (Object.keys(patch).length > 0) {
      await client.customer.update({ where: { id: match.id }, data: patch })
    }
    return match.id
  }

  const created = await client.customer.create({
    data: {
      venueId,
      name: keys.name || identity.email?.trim() || identity.phone?.trim() || 'UNKNOWN',
      email: identity.email?.trim() || null,
      phone: identity.phone?.trim() || null,
      emailKey: keys.emailKey,
      phoneKey: keys.phoneKey,
    },
  })

  return created.id
}
