import type { RiskWarning } from '../lib/risk'

export default function RiskBanner({ warnings, title }: { warnings: RiskWarning[]; title?: string }) {
  if (!warnings.length) return null
  return (
    <div role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="font-medium">⚠ {title ?? 'Risk rule breached'}</div>
      <ul className="ml-5 mt-1 list-disc">{warnings.map((w) => <li key={w.rule}>{w.message}</li>)}</ul>
    </div>
  )
}
