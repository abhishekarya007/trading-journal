import { useEffect, useState } from 'react'

interface Props {
  /** Capital currently in effect for the month (override or carried forward). */
  value: number
  overridden: boolean
  onSave: (v: number | null) => void // null = clear the override, go back to carrying forward
  compact?: boolean
}

export default function CapitalInput({ value, overridden, onSave, compact }: Props) {
  const [draft, setDraft] = useState(String(Math.round(value)))
  useEffect(() => { setDraft(String(Math.round(value))) }, [value])

  const commit = () => {
    const n = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(n) || n < 0) { setDraft(String(Math.round(value))); return }
    if (Math.round(n) !== Math.round(value)) onSave(n)
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">₹</span>
        <input type="number" min={0} inputMode="decimal" value={draft} aria-label="Trading capital for the month"
          onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.target.select()} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className={`input num !pl-6 ${compact ? '!w-32 !py-1.5' : '!w-36'} ${overridden ? '!border-accent/60' : ''}`} />
      </span>
      {overridden && (
        <button type="button" className="text-[11px] text-muted underline decoration-dotted hover:text-fg" onClick={() => onSave(null)}
          title="Remove this month's amount and reuse the previous month's">reset</button>
      )}
    </span>
  )
}
