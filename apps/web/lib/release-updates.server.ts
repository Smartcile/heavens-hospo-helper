// Server half of the release-updates feature: loads the committed snapshot.
// Kept separate from `release-updates.ts` so the client component never pulls
// in the JSON file and the API route has one typed source.
import snapshotJson from '@/content/release-updates.json'
import { normaliseSnapshot, type ReleaseSnapshot } from '@/lib/release-updates'

export const releaseSnapshot: ReleaseSnapshot = normaliseSnapshot(snapshotJson)
