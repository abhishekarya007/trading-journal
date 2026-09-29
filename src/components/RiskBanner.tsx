import type { RiskWarning } from '../lib/risk'

export default function RiskBanner({ warnings, title }: { warnings: RiskWarning[]; title?: string }) {
  if (!warnings.length) return null
  return (
    <div role="alert" className="rounded-xl border border-warn/50 bg-warn/10 p-3 text-sm text-fg">
      <div className="font-medium">⚠ {title ?? 'Risk rule breached'}</div>
      <ul className="ml-5 mt-1 list-disc">{warnings.map((w) => <li key={w.rule}>{w.message}</li>)}</ul>
    </div>
  )
}
