export default function Stat({ label, value, sub, className = '' }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="card rise">
      <div className="label !mb-2">{label}</div>
      <div className={`num text-2xl font-semibold tracking-tight ${className}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  )
}
