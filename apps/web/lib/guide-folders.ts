// Playbook folders — pure grouping/ordering for the admin and worker guide
// lists. Flat (one level): a guide belongs to at most one folder.

export interface FolderLike {
  id: string
  name: string
  sortOrder: number
}

export interface FolderedGuide {
  folderId: string | null
}

/** Folders by sortOrder, then name — the display order. */
export function sortFolders<T extends FolderLike>(folders: T[]): T[] {
  return [...folders].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/** The next sortOrder to give a newly created folder. */
export function nextFolderSortOrder(folders: { sortOrder: number }[]): number {
  return folders.reduce((max, f) => Math.max(max, f.sortOrder), -1) + 1
}

/**
 * Group guides under their folder, in folder order. Every folder is returned
 * (even empty — an admin needs somewhere to drop a guide), and an UNFILED bucket
 * (`folder: null`) is appended only when unfiled guides exist.
 */
export function groupGuidesByFolder<T extends FolderedGuide, F extends FolderLike>(
  guides: T[],
  folders: F[],
): { folder: F | null; guides: T[] }[] {
  const ordered = sortFolders(folders)
  const byFolder = new Map<string, T[]>()
  for (const f of ordered) byFolder.set(f.id, [])
  const unfiled: T[] = []
  for (const g of guides) {
    if (g.folderId && byFolder.has(g.folderId)) byFolder.get(g.folderId)!.push(g)
    else unfiled.push(g)
  }
  const groups: { folder: F | null; guides: T[] }[] = ordered.map((folder) => ({
    folder,
    guides: byFolder.get(folder.id) ?? [],
  }))
  if (unfiled.length) groups.push({ folder: null, guides: unfiled })
  return groups
}
