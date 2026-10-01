import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Settings, WeeklyReview } from '../lib/types'
import { summarize, type Row } from '../lib/stats'
import { evaluateDay } from '../lib/risk'
import { db } from '../lib/db'
import { addDays, formatRange, localDate, weekDays, weekStart } from '../lib/week'
import { inr, pct, pnlColor } from '../lib/format'
import PageTitle from '../components/PageTitle'
import CoachCard from '../components/CoachCard'

const emptyReview = (ws: string): WeeklyReview => ({ weekStart: ws, wentWell: '', improve: '', focus: '' })

function top(rows: Row[], pick: (r: Row) => string[]) {
  const m = new Map<string, number>()
  for (const r of rows) for (const k of pick(r)) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]
}

export default function Weekly({ rows, settings }: { rows: Row[]; settings: Settings }) {
  const navigate = useNavigate()
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

  const delta = prevRows.length ? s.net - prev.net : null
  const dayTiles = days.map((d) => {
    const r = weekRows.filter((x) => x.trade.date === d)
    return { date: d, count: r.length, net: r.reduce((a, x) => a + x.res.net, 0) }
  })
  const dayName = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })
  const dayNum = (d: string) => new Date(d + 'T00:00:00').getDate()
  const short = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  /** One line in a "label ... value" list. */
  const Line = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-4 border-t border-line/70 py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  )

  return (
    <div className="space-y-5">
      <PageTitle title="Weekly review" sub={formatRange(ws)}>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => navigate(`/report?mode=week&p=${ws}`)} title="A printable summary of this week">Report</button>
          <div className="seg" role="group" aria-label="Choose week">
            <button type="button" aria-label="Previous week" onClick={() => setWs(addDays(ws, -7))}>‹ Prev</button>
            <button type="button" aria-pressed={ws === thisWeek} onClick={() => setWs(thisWeek)} disabled={ws === thisWeek}>This week</button>
            <button type="button" aria-label="Next week" onClick={() => setWs(addDays(ws, 7))} disabled={ws >= thisWeek} className="disabled:opacity-40">Next ›</button>
          </div>
        </div>
      </PageTitle>

      {/* This week's focus comes first: it is what you decided last week to work on */}
      {prevFocus && (
        <div className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-5 py-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent" aria-hidden="true">◎</span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-accent">Your focus this week <span className="text-muted">· set in last week&apos;s review</span></div>
            <div className="mt-0.5 text-base font-medium">{prevFocus}</div>
          </div>
        </div>
      )}

      {weekRows.length === 0 ? (
        <div className="card py-10 text-center text-sm text-muted">No trades this week.</div>
      ) : (
        <>
          {/* The week in four numbers */}
          <div className="card !p-0">
            <div className="grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
              <div className="p-5">
                <div className="label">Net P&amp;L</div>
                <div className={`num text-3xl font-semibold ${pnlColor(s.net)}`}>{inr(s.net)}</div>
                <div className="mt-1 text-xs text-muted">
                  {delta === null ? `${s.count} trades` : <><span className={`num font-medium ${pnlColor(delta)}`}>{delta >= 0 ? '▲ +' : '▼ '}{inr(delta)}</span> vs last week</>}
                </div>
              </div>
              <div className="p-5">
                <div className="label">Win rate</div>
                <div className="num text-3xl font-semibold">{pct(s.winRate)}</div>
                <div className="mt-1 text-xs text-muted">{s.count} trades · profit factor {Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}</div>
              </div>
              <div className="border-t border-line p-5 md:border-t-0">
                <div className="label">Plan followed</div>
                <div className="num text-3xl font-semibold">{pct((followed / weekRows.length) * 100)}</div>
                <div className="mt-1 text-xs text-muted">{followed} of {weekRows.length} trades</div>
              </div>
              <div className="border-t border-line p-5 md:border-t-0">
                <div className="label">Charges paid</div>
                <div className="num text-3xl font-semibold">{inr(s.charges)}</div>
                <div className="mt-1 text-xs text-muted">{pct(s.net + s.charges > 0 ? (s.charges / (s.net + s.charges)) * 100 : 0)} of gross profit</div>
              </div>
            </div>
          </div>

          {/* Day by day */}
          <div className="card">
            <h3 className="mb-3 text-sm font-semibold">Day by day</h3>
            {/* Phone: seven tiles are too narrow, so show a simple list of the days you traded */}
            <ul className="divide-y divide-line/70 sm:hidden">
              {dayTiles.filter((d) => d.count > 0).map((d) => (
                <li key={d.date} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium">{dayName(d.date)} <span className="text-muted">{short(d.date)}</span> <span className="text-xs text-muted">· {d.count} trade{d.count === 1 ? '' : 's'}</span></span>
                  <span className={`num font-semibold ${pnlColor(d.net)}`}>{d.net > 0 ? '+' : ''}{inr(Math.round(d.net))}</span>
                </li>
              ))}
            </ul>
            <div className="hidden grid-cols-7 gap-2 sm:grid">
              {dayTiles.map((d) => {
                const has = d.count > 0
                const tone = !has ? '' : d.net > 0 ? 'up' : d.net < 0 ? 'down' : ''
                return (
                  <div key={d.date} title={has ? `${d.date}: ${inr(d.net, 2)} · ${d.count} trades` : `${d.date}: no trades`}
                    style={tone ? { background: `color-mix(in srgb, var(--${tone}) 12%, transparent)`, borderColor: `color-mix(in srgb, var(--${tone}) 35%, transparent)` } : undefined}
                    className={`flex min-h-[88px] flex-col rounded-xl border p-2 text-center sm:p-3 ${has ? '' : 'border-line bg-panel2/40'} ${d.date === localDate() ? 'ring-2 ring-accent' : ''}`}>
                    <div className="text-[11px] font-medium text-muted">{dayName(d.date)} <span className="text-fg/70">{dayNum(d.date)}</span></div>
                    {has ? (
                      <>
                        <div className={`num mt-auto text-[13px] font-semibold sm:text-sm ${pnlColor(d.net)}`}>{d.net > 0 ? '+' : ''}{inr(Math.round(d.net))}</div>
                        <div className="text-[10px] text-muted">{d.count} trade{d.count === 1 ? '' : 's'}</div>
                      </>
                    ) : <div className="mt-auto text-xs text-muted/60">–</div>}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="card">
              <h3 className="mb-3 text-sm font-semibold">Highlights</h3>
              <dl>
                {best && <Line label="Best trade"><b>{best.trade.symbol}</b> <span className="text-xs text-muted">{short(best.trade.date)}</span> <span className={`num ${pnlColor(best.res.net)}`}>{inr(best.res.net)}</span></Line>}
                {worst && <Line label="Worst trade"><b>{worst.trade.symbol}</b> <span className="text-xs text-muted">{short(worst.trade.date)}</span> <span className={`num ${pnlColor(worst.res.net)}`}>{inr(worst.res.net)}</span></Line>}
                {topSetup && <Line label="Most used setup"><b>{topSetup[0]}</b> <span className="text-xs text-muted">{topSetup[1]}×</span></Line>}
                <Line label="Most common mistake">{topMistake ? <><b>{topMistake[0]}</b> <span className="text-xs text-muted">{topMistake[1]}×</span></> : <span className="text-up">None tagged</span>}</Line>
              </dl>
            </div>
            <div className="card">
              <h3 className="mb-3 text-sm font-semibold">Discipline</h3>
              <dl>
                <Line label="Broke your plan">{brokePlan.length ? <><b>{brokePlan.length}</b> <span className="text-xs text-muted">{brokePlan.length === 1 ? 'trade' : 'trades'}, net</span> <span className={`num ${pnlColor(brokeCost)}`}>{inr(brokeCost)}</span></> : <span className="text-up">Never</span>}</Line>
                <Line label="Risk rules">{breachDays.length ? <span className="text-warn">{breachDays.length} {breachDays.length === 1 ? 'day' : 'days'} breached</span> : <span className="text-up">None breached</span>}</Line>
                {breachDays.map(({ d, w }) => (
                  <Line key={d} label={short(d)}><span className="text-xs text-warn">{w.map((x) => x.message).join(' ')}</span></Line>
                ))}
              </dl>
            </div>
          </div>
        </>
      )}

      {/* Reflection, with last week's focus on top */}
      <div className="card">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Reflection <span className="text-xs font-normal text-muted">· saved automatically</span></h3>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {([['wentWell', 'What went well?'], ['improve', 'What should I improve?'], ['focus', 'One focus for next week']] as const).map(([k, label]) => (
            <div key={k}><label className="label">{label}</label>
              <textarea className="input" rows={4} value={review[k]} onChange={(e) => update(k, e.target.value)} /></div>
          ))}
        </div>
      </div>

      <CoachCard hideThisWeek rows={rows} settings={settings} weekKey={ws} onFocusSaved={(text) => setReview((r) => ({ ...r, focus: text }))} />
    </div>
  )
}
