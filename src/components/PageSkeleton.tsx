/** Placeholder shown while the journal loads from the browser database. */
export default function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="Loading your journal">
      <div className="skeleton h-9 w-56" />
      <div className="skeleton h-40" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}
      </div>
      <div className="skeleton h-64" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
