import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Settings } from '../lib/types'
import type { Row } from '../lib/stats'
import { db } from '../lib/db'
import { coachRows, workOn } from '../lib/coach'
import { localDate } from '../lib/week'
import { inr } from '../lib/format'
import { toast } from '../lib/toast'

interface Props {
  rows: Row[]
  settings: Settings
  weekKey: string // Monday of the week whose "focus" this card writes to
  onFocusSaved?: (text: string) => void
}

export default function CoachCard({ rows, settings, weekKey, onFocusSaved }: Props) {
  const [focus, setFocus] = useState('')
  const scoped = useMemo(() => coachRows(rows, localDate()), [rows])
  const result = useMemo(() => workOn(scoped.rows, settings.exitMistakes), [scoped, settings.exitMistakes])

  useEffect(() => {
    let cancelled = false
    db.reviews.get(weekKey).then((r) => { if (!cancelled) setFocus(r?.focus ?? '') })
    return () => { cancelled = true }
  }, [weekKey])

  const makeFocus = async (text: string) => {
    const cur = await db.reviews.get(weekKey)
    if (cur?.focus.trim() && cur.focus.trim() !== text && !confirm(`Replace your current focus?\n\n“${cur.focus.trim()}”`)) return
    await db.reviews.put({ wentWell: '', improve: '', ...cur, weekStart: weekKey, focus: text })
    setFocus(text)
    onFocusSaved?.(text)
    toast('Set as your focus')
  }

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">What to work on</h3>
          <p className="text-xs text-muted">The habits costing you the most, based on {scoped.scope}.</p>
        </div>
        <Link to="/insights" className="text-xs text-accent hover:underline">Full analysis →</Link>
      </div>

      {!result.enough ? (
        <p className="py-4 text-center text-sm text-muted">Log at least 8 trades and your costliest habits will show up here.</p>
      ) : result.items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">✅ Nothing stands out. No single habit is costing you money right now.</p>
      ) : (
        <ol className="space-y-2.5">
          {result.items.map((it, i) => {
            const active = focus.trim() === it.focus
            return (
              <li key={it.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-panel2/40 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-down/15 font-display text-sm font-bold text-down">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold">{it.title}</span>
                    <span className="num text-sm font-semibold text-down">{it.estimate ? 'up to ' : ''}-{inr(it.cost)}</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{it.detail}</p>
                </div>
                <button className={`btn-ghost !px-2.5 !py-1 text-xs ${active ? '!border-up/50 !text-up' : ''}`} onClick={() => makeFocus(it.focus)} disabled={active}>
                  {active ? '✓ Your focus' : 'Make this my focus'}
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {focus.trim() && (
        <div className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-sm">
          <span className="label !mb-0.5">🎯 Your focus this week</span>
          {focus}
        </div>
      )}
      {result.items.length > 0 && (
        <p className="mt-2 text-[11px] text-muted">
          These overlap (one trade can fall under several habits), so don&apos;t add the amounts together.
          {result.total > result.items.length && <> Showing the top {result.items.length} of {result.total}.</>}
        </p>
      )}
    </div>
  )
}
