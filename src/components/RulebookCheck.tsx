import { useMemo } from 'react'
import type { Settings, Trade } from '../lib/types'
import type { Row } from '../lib/stats'
import { checkDraft, describeRule } from '../lib/rulebook'

/** Live rulebook result for the trade being typed. Only a heads-up: it never stops you saving. */
export default function RulebookCheck({ draft, rows, settings }: { draft: Trade; rows: Row[]; settings: Settings }) {
  const check = useMemo(() => checkDraft(draft, rows, settings), [draft, rows, settings])
  if (!check || check.passed + check.failed === 0) return null
  const failed = check.results.filter((r) => r.outcome === 'fail')
  const skipped = check.results.filter((r) => r.outcome === 'na').length
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${failed.length ? 'border-warn/50 bg-warn/10' : 'border-up/40 bg-up/10'}`} aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{failed.length ? `Rulebook: ${failed.length} ${failed.length === 1 ? 'rule' : 'rules'} broken` : 'Rulebook: every rule followed ✓'}</span>
        <span className="text-xs text-muted">{check.passed} of {check.passed + check.failed} followed{skipped ? ` · ${skipped} can't be checked yet` : ''}</span>
      </div>
      {failed.length > 0 && <ul className="mt-1 space-y-0.5 text-xs">{failed.map((f) => <li key={f.rule.id} className="text-down">✕ {describeRule(f.rule)}</li>)}</ul>}
    </div>
  )
}
