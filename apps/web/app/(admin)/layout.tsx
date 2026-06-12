// This route group is intentionally empty.
// Admin routes are under app/admin/(protected)/ for correct /admin/* URL paths.
export default function UnusedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
