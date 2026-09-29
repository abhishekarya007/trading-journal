import { useEffect, useMemo, useState } from 'react'
import type { Settings, WeeklyReview } from '../lib/types'
import { summarize, type Row } from '../lib/stats'
import { evaluateDay } from '../lib/risk'
import { db } from '../lib/db'
import { addDays, formatRange, localDate, weekDays, weekStart } from '../lib/week'
import { inr, pct, pnlColor } from '../lib/format'
import Stat from '../components/Stat'
import PageTitle from '../components/PageTitle'
import CoachCard from '../components/CoachCard'

const emptyReview = (ws: string): WeeklyReview => ({ weekStart: ws, wentWell: '', improve: '', focus: '' })

function top(rows: Row[], pick: (r: Row) => string[]) {
  const m = new Map<string, number>()
  for (const r of rows) for (const k of pick(r)) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]
}

export default function Weekly({ rows, settings }: { rows: Row[]; settings: Settings }) {
  const thisWeek = weekStart(localDate())
  const [ws, setWs] = useState(thisWeek)
  const [review, setReview] = useState<WeeklyReview>(emptyReview(ws))
  const [prevFocus, setPrevFocus] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [cur, prev] = await Promise.all([db.reviews.get(ws), db.reviews.get(addDays(ws, -7))])
      if (cancelled) return
      setReview(cur ?? emptyReview(ws))
      setPrevFocus(prev?.focus ?? '')
    })()
    return () => { cancelled = true }
  }, [ws])

  const update = (k: 'wentWell' | 'improve' | 'focus', v: string) => {
    const next = { ...review, [k]: v }
    setReview(next)
    db.reviews.put(next)
  }

  const days = useMemo(() => weekDays(ws), [ws])
  const weekRows = useMemo(() => rows.filter((r) => days.includes(r.trade.date)), [rows, days])
  const prevRows = useMemo(() => {
    const pd = weekDays(addDays(ws, -7))
    return rows.filter((r) => pd.includes(r.trade.date))
  }, [rows, ws])

  const s = useMemo(() => summarize(weekRows), [weekRows])
  const prev = useMemo(() => summarize(prevRows), [prevRows])
  const followed = weekRows.filter((r) => r.trade.followedPlan).length
  const best = weekRows.reduce<Row | null>((b, r) => (!b || r.res.net > b.res.net ? r : b), null)
  const worst = weekRows.reduce<Row | null>((b, r) => (!b || r.res.net < b.res.net ? r : b), null)
  const topMistake = top(weekRows, (r) => r.trade.mistakes)
  const topSetup = top(weekRows, (r) => [r.trade.setup])
  const breachDays = days.map((d) => ({ d, w: evaluateDay(rows, d, settings.risk) })).filter((x) => x.w.length)
  const brokePlan = weekRows.filter((r) => !r.trade.followedPlan)
  const brokeCost = brokePlan.reduce((a, r) => a + r.res.net, 0)

  return (
    <div className="space-y-4">
      <PageTitle title="Weekly review" sub={formatRange(ws)}>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setWs(addDays(ws, -7))} aria-label="Previous week">‹ Prev</button>
          <button className="btn-ghost" onClick={() => setWs(thisWeek)} disabled={ws === thisWeek}>This week</button>
          <button className="btn-ghost" onClick={() => setWs(addDays(ws, 7))} disabled={ws >= thisWeek} aria-label="Next week">Next ›</button>
        </div>
      </PageTitle>

      {prevFocus && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
          <b>Your focus from last week:</b> {prevFocus}
        </div>
      )}

      {weekRows.length === 0 ? (
        <div className="card py-8 text-center text-sm text-muted">No trades this week.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Net P&L" value={inr(s.net)} className={pnlColor(s.net)}
              sub={prevRows.length ? `vs ${inr(prev.net)} last week (${s.net - prev.net >= 0 ? '+' : ''}${inr(s.net - prev.net)})` : `${s.count} trades`} />
            <Stat label="Win rate" value={pct(s.winRate)} sub={`${s.count} trades · profit factor ${Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}`} />
            <Stat label="Plan adherence" value={pct((followed / weekRows.length) * 100)} sub={`${followed} of ${weekRows.length} followed plan`} />
            <Stat label="Charges paid" value={inr(s.charges)} sub={`${pct(s.net + s.charges > 0 ? (s.charges / (s.net + s.charges)) * 100 : 0)} of gross profit`} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="card space-y-1 text-sm">
              <h3 className="font-semibold">Highlights</h3>
              {best && <p>🏆 Best: <b>{best.trade.symbol}</b> ({best.trade.date}) <span className={pnlColor(best.res.net)}>{inr(best.res.net)}</span></p>}
              {worst && <p>💥 Worst: <b>{worst.trade.symbol}</b> ({worst.trade.date}) <span className={pnlColor(worst.res.net)}>{inr(worst.res.net)}</span></p>}
              {topSetup && <p>🎯 Most used setup: <b>{topSetup[0]}</b> ({topSetup[1]}×)</p>}
              <p>{topMistake ? <>⚠ Most common mistake: <b>{topMistake[0]}</b> ({topMistake[1]}×)</> : '✅ No mistakes tagged this week.'}</p>
            </div>
            <div className="card space-y-1 text-sm">
              <h3 className="font-semibold">Discipline</h3>
              <p>{brokePlan.length ? <>Trades where you broke your plan: <b>{brokePlan.length}</b>, net <span className={pnlColor(brokeCost)}>{inr(brokeCost)}</span></> : '✅ You followed your plan on every trade.'}</p>
              {breachDays.length ? breachDays.map(({ d, w }) => (
                <p key={d} className="text-warn">⚠ {d}: {w.map((x) => x.message).join(' ')}</p>
              )) : <p>✅ No risk rules breached.</p>}
            </div>
          </div>
        </>
      )}

      <CoachCard rows={rows} settings={settings} weekKey={ws} onFocusSaved={(text) => setReview((r) => ({ ...r, focus: text }))} />

      <div className="card space-y-3">
        <h3 className="text-sm font-semibold">Reflection <span className="text-xs font-normal text-muted">(saved automatically)</span></h3>
        {([['wentWell', 'What went well?'], ['improve', 'What should I improve?'], ['focus', 'One focus for next week']] as const).map(([k, label]) => (
          <div key={k}><label className="label">{label}</label>
            <textarea className="input" rows={k === 'focus' ? 2 : 3} value={review[k]} onChange={(e) => update(k, e.target.value)} /></div>
        ))}
      </div>
    </div>
  )
}
