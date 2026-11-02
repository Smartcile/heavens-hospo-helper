// Worker notice list grouping. Pinned notices always float to the top;
// everything else splits into unread and acknowledged, so the floor's
// "GOT IT" items sink to the bottom instead of cluttering the top.

export interface NoticeGroupable {
  pinned: boolean
  requiresAck: boolean
  acked: boolean
}

export interface WorkerNoticeGroups<T> {
  pinned: T[]
  unread: T[]
  acknowledged: T[]
}

export function groupWorkerNotices<T extends NoticeGroupable>(items: T[]): WorkerNoticeGroups<T> {
  const pinned: T[] = []
  const unread: T[] = []
  const acknowledged: T[] = []
  for (const n of items) {
    if (n.pinned) pinned.push(n)
    else if (n.requiresAck && n.acked) acknowledged.push(n)
    else unread.push(n)
  }
  return { pinned, unread, acknowledged }
}
