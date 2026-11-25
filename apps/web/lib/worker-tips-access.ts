// Tips are not a floor-staff feature: only an ADMIN or MANAGER logged into the
// worker view may open the page/tile and see any tip value. The gate lives in
// one place so the dashboard tile, the page and every worker route agree.
export function workerMayAccessTips(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'MANAGER'
}
