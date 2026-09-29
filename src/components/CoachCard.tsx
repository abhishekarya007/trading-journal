import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Settings } from '../lib/types'
import type { Row } from '../lib/stats'
import { db } from '../lib/db'
import { coachRows, workOn } from '../lib/coach'
import { addDays, localDate } from '../lib/week'
import { inr } from '../lib/format'
import { toast } from '../lib/toast'

interface Props {
  rows: Row[]
  settings: Settings
  /**
   * Monday of the week being viewed. A focus is written in a week's review ("One focus for next week")
   * and applies to the FOLLOWING week, so:
   *  - "this week's focus" is read from the review of the week before `weekKey`
   *  - the buttons here save into `weekKey`'s own "focus for next week" field
   */
  weekKey: string
  onFocusSaved?: (text: string) => void
  hideThisWeek?: boolean // the Weekly page already shows last week's focus at the top
}

export default function CoachCard({ rows, settings, weekKey, onFocusSaved, hideThisWeek }: Props) {
  const [thisWeek, setThisWeek] = useState('') // set in last week's review
  const [next, setNext] = useState('') // set in this week's review, applies from next week
  const scoped = useMemo(() => coachRows(rows, localDate()), [rows])
  const result = useMemo(() => workOn(scoped.rows, settings.exitMistakes), [scoped, settings.exitMistakes])

  useEffect(() => {
    let cancelled = false
    Promise.all([db.reviews.get(addDays(weekKey, -7)), db.reviews.get(weekKey)]).then(([prev, cur]) => {
      if (cancelled) return
      setThisWeek(prev?.focus ?? '')
      setNext(cur?.focus ?? '')
    })
    return () => { cancelled = true }
  }, [weekKey])

  const writeFocus = async (value: string) => {
    const latest = await db.reviews.get(weekKey)
    await db.reviews.put({ wentWell: '', improve: '', ...latest, weekStart: weekKey, focus: value })
    setNext(value)
    onFocusSaved?.(value)
  }
  const makeFocus = async (text: string) => {
    const previous = (await db.reviews.get(weekKey))?.focus ?? ''
    await writeFocus(text)
    const replaced = previous.trim() !== '' && previous.trim() !== text
    toast(replaced ? 'Next week’s focus replaced' : 'Set as next week’s focus', 'success', {
      action: { label: 'Undo', run: async () => { await writeFocus(previous); toast('Focus restored', 'info') } },
    })
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
            const active = next.trim() === it.focus
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
                <button className={`btn-ghost !px-2.5 !py-1 text-xs ${active ? '!border-up/50 !text-up' : ''}`} onClick={() => makeFocus(it.focus)} disabled={active}
                  title="Saved in this week’s review as “One focus for next week”">
                  {active ? '✓ Next week’s focus' : 'Set as next week’s focus'}
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {!hideThisWeek && thisWeek.trim() && (
        <div className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-sm">
          <span className="label !mb-0.5">🎯 Your focus this week <span className="normal-case tracking-normal text-muted">· from last week’s review</span></span>
          {thisWeek}
        </div>
      )}
      {next.trim() && (
        <div className="mt-2 rounded-xl border border-line bg-panel2/40 px-3.5 py-2 text-xs">
          <span className="text-muted">Saved for next week: </span>{next}
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
