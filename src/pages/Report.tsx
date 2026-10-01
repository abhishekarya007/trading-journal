import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import type { Settings, WeeklyReview } from '../lib/types'
import { summarize, type Row } from '../lib/stats'
import { db } from '../lib/db'
import { monthlyCapital } from '../lib/capital'
import { goalStatus } from '../lib/goals'
import { mistakeCost, scorecard, symbolBoard } from '../lib/insights'
import { dayList } from '../lib/habits'
import { workOn } from '../lib/coach'
import { addDays, formatRange, localDate, weekDays, weekStart } from '../lib/week'
import { inr, pct } from '../lib/format'
import { COLORS } from '../lib/theme'
import PageTitle from '../components/PageTitle'

interface Props { rows: Row[]; settings: Settings }
type Mode = 'week' | 'month'

const num2 = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const sgn = (n: number) => (n > 0 ? '+' : '') + inr(n)
const tone = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted')
const monthName = (key: string) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' }) }
const AXIS = { fontSize: 10, fill: '#5b6579' }

function Kpi({ label, value, sub, className = '' }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className="avoid-break rounded-lg border border-line p-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${className}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  )
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 border-b border-line pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{children}</h2>
}

export default function Report({ rows, settings }: Props) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const today = localDate()
  const [reviews, setReviews] = useState<WeeklyReview[]>([])
  useEffect(() => { db.reviews.toArray().then(setReviews) }, [])

  const months = useMemo(() => [...new Set([today.slice(0, 7), ...rows.map((r) => r.trade.date.slice(0, 7))])].sort().reverse(), [rows, today])
  const weeks = useMemo(() => [...new Set([weekStart(today), ...rows.map((r) => weekStart(r.trade.date))])].sort().reverse(), [rows, today])

  const mode: Mode = params.get('mode') === 'week' ? 'week' : 'month'
  const list = mode === 'week' ? weeks : months
  const period = list.includes(params.get('p') ?? '') ? params.get('p')! : (list.find((k) => rows.some((r) => (mode === 'week' ? weekStart(r.trade.date) : r.trade.date.slice(0, 7)) === k)) ?? list[0])
  const [withTrades, setWithTrades] = useState<boolean | null>(null)
  const includeTrades = withTrades ?? mode === 'week'

  const go = (m: Mode, p?: string) => setParams({ mode: m, ...(p ? { p } : {}) }, { replace: true })
  const idx = list.indexOf(period)

  const label = mode === 'week' ? `Week of ${formatRange(period)}` : monthName(period)
  const pRows = useMemo(() => {
    const wk = mode === 'week' ? weekDays(period) : []
    return rows
      .filter((r) => (mode === 'week' ? wk.includes(r.trade.date) : r.trade.date.startsWith(period)))
      .sort((a, b) => a.trade.date.localeCompare(b.trade.date) || (a.trade.id ?? 0) - (b.trade.id ?? 0))
  }, [rows, mode, period])

  const d = useMemo(() => {
    const s = summarize(pRows)
    const days = dayList(pRows)
    let cum = 0
    const curve = pRows.map((r, i) => { cum += r.res.net; return { i: i + 1, date: r.trade.date, v: Math.round(cum * 100) / 100 } })
    const best = pRows.reduce<Row | null>((b, r) => (!b || r.res.net > b.res.net ? r : b), null)
    const worst = pRows.reduce<Row | null>((b, r) => (!b || r.res.net < b.res.net ? r : b), null)
    const bestDay = days.reduce<(typeof days)[number] | null>((b, x) => (!b || x.net > b.net ? x : b), null)
    const worstDay = days.reduce<(typeof days)[number] | null>((b, x) => (!b || x.net < b.net ? x : b), null)
    const followed = pRows.filter((r) => r.trade.followedPlan).length
    const mist = mistakeCost(pRows, settings.exitMistakes)
    const symbols = symbolBoard(pRows)
    const caps = monthlyCapital(rows, settings, today.slice(0, 7))
    const cap = mode === 'month' ? caps.get(period) : undefined
    const gs = cap ? goalStatus(s.net, cap.goal, cap.maxLoss, period, today) : null
    const range = mode === 'week' ? [period, addDays(period, 6)] : [`${period}-01`, `${period}-31`]
    const periodReviews = reviews
      .filter((r) => (mode === 'week' ? r.weekStart === period : r.weekStart >= addDays(range[0], -6) && r.weekStart <= range[1]))
      .filter((r) => r.wentWell.trim() || r.improve.trim() || r.focus.trim())
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    return {
      s, days, curve, best, worst, bestDay, worstDay, followed, mist, cap, gs, periodReviews,
      setups: scorecard(pRows, (r) => r.trade.setup || 'None').slice(0, 5),
      topSymbols: symbols.filter((x) => x.net > 0).slice(0, 3),
      weakSymbols: [...symbols].reverse().filter((x) => x.net < 0).slice(0, 3),
      work: workOn(pRows, settings.exitMistakes, 3),
    }
  }, [pRows, rows, settings, mode, period, today, reviews])

  const print = () => window.print()

  return (
    <div className="space-y-5">
      <div className="no-print">
        <PageTitle title="Report" sub="A one-page summary you can print or save as a PDF to keep or share." />
        <div className="card flex flex-wrap items-center gap-3">
          <div className="seg" role="group" aria-label="Report period type">
            <button aria-pressed={mode === 'week'} onClick={() => go('week')}>Weekly</button>
            <button aria-pressed={mode === 'month'} onClick={() => go('month')}>Monthly</button>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="btn-ghost !px-2.5" onClick={() => idx < list.length - 1 && go(mode, list[idx + 1])} disabled={idx >= list.length - 1} aria-label="Earlier period">‹</button>
            <select className="input !w-auto !py-1.5" value={period} onChange={(e) => go(mode, e.target.value)} aria-label="Period">
              {list.map((k) => <option key={k} value={k}>{mode === 'week' ? `Week of ${formatRange(k)}` : monthName(k)}</option>)}
            </select>
            <button className="btn-ghost !px-2.5" onClick={() => idx > 0 && go(mode, list[idx - 1])} disabled={idx <= 0} aria-label="Later period">›</button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={includeTrades} onChange={(e) => setWithTrades(e.target.checked)} /> Include the trade list
          </label>
          <button className="btn ml-auto" onClick={print} disabled={pRows.length === 0}>Print / Save as PDF</button>
          <p className="w-full text-xs text-muted">In the print window choose <b className="text-fg">Save as PDF</b> as the destination. Turning off “Headers and footers” gives a cleaner page.</p>
        </div>
      </div>

      <div className="report-sheet mx-auto max-w-[820px] space-y-5 overflow-x-auto rounded-2xl border border-line p-6 shadow-xl md:p-8">
        {/* Title */}
        <div className="avoid-break flex flex-wrap items-end justify-between gap-2 border-b-2 border-fg pb-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Trading report · {mode === 'week' ? 'Weekly' : 'Monthly'}</div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{label}</h1>
          </div>
          <div className="text-right text-[11px] text-muted">TradeDesk · NSE intraday<br />Generated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>

        {pRows.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">No trades in this period.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Net P&L" className={tone(d.s.net)} value={sgn(d.s.net)}
                sub={d.cap && d.cap.capital > 0 ? `${d.cap.returnPct > 0 ? '+' : ''}${d.cap.returnPct.toFixed(2)}% on ${inr(d.cap.capital)}` : `${d.s.count} trades`} />
              <Kpi label="Win rate" value={pct(d.s.winRate)} sub={`${pRows.filter((r) => r.res.net > 0).length} won · ${pRows.filter((r) => r.res.net < 0).length} lost`} />
              <Kpi label="Profit factor" value={Number.isFinite(d.s.profitFactor) ? d.s.profitFactor.toFixed(2) : '∞'} sub={`Expectancy ${sgn(d.s.expectancy)} / trade`} />
              <Kpi label="Charges paid" value={inr(d.s.charges)} sub={`Max drawdown ${inr(d.s.maxDrawdown)}`} />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Trades" value={d.s.count} sub={`${d.days.length} trading ${d.days.length === 1 ? 'day' : 'days'}`} />
              <Kpi label="Avg win / loss" value={<span><span className="text-up">{inr(d.s.avgWin)}</span> <span className="text-muted">/</span> <span className="text-down">{inr(d.s.avgLoss)}</span></span>} />
              <Kpi label="Best day" className="text-up" value={d.bestDay ? sgn(d.bestDay.net) : '–'} sub={d.bestDay?.date} />
              <Kpi label="Worst day" className="text-down" value={d.worstDay && d.worstDay.net < 0 ? sgn(d.worstDay.net) : '–'} sub={d.worstDay && d.worstDay.net < 0 ? d.worstDay.date : undefined} />
            </div>

            {d.gs && (d.gs.goal > 0 || d.gs.maxLoss > 0) && (
              <div className="avoid-break grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-2">
                {d.gs.goal > 0 && (
                  <div>
                    <div className="flex justify-between text-xs"><span className="font-semibold">Profit goal</span><span className="num">{inr(Math.max(0, d.gs.net))} of {inr(d.gs.goal)} · {Math.max(0, Math.round(d.gs.goalPct))}%</span></div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full bg-up" style={{ width: `${Math.min(100, Math.max(0, d.gs.goalPct))}%` }} /></div>
                    <div className="mt-1 text-[11px] text-muted">{d.gs.reached ? 'Goal reached' : `${inr(d.gs.goalLeft)} short of the goal`}</div>
                  </div>
                )}
                {d.gs.maxLoss > 0 && (
                  <div>
                    <div className="flex justify-between text-xs"><span className="font-semibold">Loss limit</span><span className="num">{inr(d.gs.lossUsed)} of {inr(d.gs.maxLoss)} · {Math.round(d.gs.lossUsedPct)}% used</span></div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full" style={{ width: `${Math.min(100, d.gs.lossUsedPct)}%`, background: d.gs.lossState === 'hit' ? 'var(--down)' : d.gs.lossState === 'warn' ? 'var(--warn)' : 'var(--up)' }} /></div>
                    <div className="mt-1 text-[11px] text-muted">{d.gs.lossState === 'hit' ? 'Limit reached' : d.gs.lossUsed === 0 ? 'No loss in the period' : `${inr(d.gs.lossLeft)} left before the limit`}</div>
                  </div>
                )}
              </div>
            )}

            {/* Charts (fixed size so print is predictable) */}
            <div className="avoid-break grid gap-4 sm:grid-cols-[3fr_2fr]">
              <div>
                <H>Cumulative P&amp;L</H>
                <AreaChart width={400} height={150} data={d.curve} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e5e9f0" vertical={false} />
                  <XAxis dataKey="i" tick={AXIS} tickLine={false} axisLine={false} hide={d.curve.length > 40} />
                  <YAxis tick={AXIS} width={46} tickLine={false} axisLine={false} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
                  <ReferenceLine y={0} stroke="#9aa4b5" />
                  <Area dataKey="v" stroke="#2563eb" strokeWidth={2} fill="#2563eb" fillOpacity={0.12} isAnimationActive={false} />
                </AreaChart>
              </div>
              <div>
                <H>P&amp;L by day</H>
                <BarChart width={270} height={150} data={d.days.map((x) => ({ n: x.date.slice(8), net: Math.round(x.net) }))} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e5e9f0" vertical={false} />
                  <XAxis dataKey="n" tick={AXIS} tickLine={false} axisLine={false} interval={0} hide={d.days.length > 22} />
                  <YAxis tick={AXIS} width={42} tickLine={false} axisLine={false} />
                  <ReferenceLine y={0} stroke="#9aa4b5" />
                  <Bar dataKey="net" radius={[2, 2, 2, 2]} isAnimationActive={false}>
                    {d.days.map((x) => <Cell key={x.date} fill={x.net >= 0 ? COLORS.up : COLORS.down} />)}
                  </Bar>
                </BarChart>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="avoid-break">
                <H>Discipline</H>
                <p className="text-sm">Followed the plan on <b className="num">{pct((d.followed / pRows.length) * 100)}</b> of trades ({d.followed} of {pRows.length}).</p>
                {d.mist.table.length === 0 ? <p className="mt-1.5 text-xs text-muted">No entry or behaviour mistakes tagged.</p> : (
                  <table className="mt-2 w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-muted"><tr><th className="py-1 text-left font-medium">Mistake</th><th className="py-1 text-right font-medium">Trades</th><th className="py-1 text-right font-medium">P&amp;L ₹</th></tr></thead>
                    <tbody>{d.mist.table.slice(0, 5).map((m) => <tr key={m.tag} className="border-t border-line"><td className="py-1">{m.tag}</td><td className="num py-1 text-right">{m.count}</td><td className={`num py-1 text-right ${tone(m.split.net)}`}>{num2(m.split.net)}</td></tr>)}</tbody>
                  </table>
                )}
                {d.mist.exit.tags.length > 0 && <p className="mt-1.5 text-[11px] text-muted">Exit mistakes: {d.mist.exit.tags.map((e) => `${e.tag} ×${e.count}`).join(', ')}.</p>}
              </div>
              <div className="avoid-break">
                <H>What to work on</H>
                {!d.work.enough ? <p className="text-xs text-muted">Needs at least 8 trades in the period.</p>
                  : d.work.items.length === 0 ? <p className="text-sm">Nothing stands out: no single habit is costing you money.</p> : (
                    <ol className="space-y-1.5 text-sm">
                      {d.work.items.map((it, i) => (
                        <li key={it.id} className="flex justify-between gap-3"><span><b>{i + 1}. {it.title}</b><span className="block text-[11px] text-muted">{it.detail}</span></span><span className="num shrink-0 font-semibold text-down">{it.estimate ? 'up to ' : ''}-{inr(it.cost)}</span></li>
                      ))}
                    </ol>
                  )}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="avoid-break">
                <H>Setups</H>
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted"><tr><th className="py-1 text-left font-medium">Setup</th><th className="py-1 text-right font-medium">Trades</th><th className="py-1 text-right font-medium">Win %</th><th className="py-1 text-right font-medium">Net ₹</th></tr></thead>
                  <tbody>{d.setups.map((x) => <tr key={x.name} className="border-t border-line"><td className="py-1">{x.name}</td><td className="num py-1 text-right">{x.count}</td><td className="num py-1 text-right">{x.winRate.toFixed(0)}</td><td className={`num py-1 text-right ${tone(x.net)}`}>{num2(x.net)}</td></tr>)}</tbody>
                </table>
              </div>
              <div className="avoid-break">
                <H>Stocks</H>
                {([['Best', d.topSymbols], ['Weakest', d.weakSymbols]] as const).map(([lbl, list2]) => (
                  <div key={lbl} className="mb-2 text-xs">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{lbl}</div>
                    {list2.length === 0 ? <div className="text-muted">None</div> : list2.map((x) => <div key={x.symbol} className="flex justify-between border-t border-line py-1"><span>{x.symbol} <span className="text-muted">· {x.count} {x.count === 1 ? 'trade' : 'trades'}</span></span><span className={`num ${tone(x.net)}`}>{num2(x.net)}</span></div>)}
                  </div>
                ))}
                {d.best && d.worst && <p className="text-[11px] text-muted">Best trade {d.best.trade.symbol} {sgn(d.best.res.net)} · worst {d.worst.trade.symbol} {sgn(d.worst.res.net)}</p>}
              </div>
            </div>

            {d.periodReviews.length > 0 && (
              <div className="avoid-break">
                <H>Reflection</H>
                <div className="space-y-3 text-sm">
                  {d.periodReviews.map((r) => (
                    <div key={r.weekStart} className="rounded-lg border border-line p-3">
                      {mode === 'month' && <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Week of {formatRange(r.weekStart)}</div>}
                      {r.wentWell.trim() && <p><b>Went well:</b> {r.wentWell}</p>}
                      {r.improve.trim() && <p><b>To improve:</b> {r.improve}</p>}
                      {r.focus.trim() && <p><b>Focus for next week:</b> {r.focus}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {includeTrades && (
              <div>
                <H>Trades ({pRows.length})</H>
                <table className="w-full text-[11px]">
                  <thead className="text-[10px] uppercase tracking-wider text-muted">
                    <tr>{['Date', 'Symbol', 'Side', 'Qty', 'Entry', 'Exit', 'Charges', 'Net ₹', 'R', 'Setup'].map((h, i) => <th key={h} className={`py-1 font-medium ${i >= 3 && i <= 8 ? 'text-right' : 'text-left'} ${i === 9 ? 'pl-4' : ''}`}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {pRows.map(({ trade: t, res }) => (
                      <tr key={t.id} className="border-t border-line">
                        <td className="num py-1 text-muted">{t.date}</td><td className="py-1 font-semibold">{t.symbol}</td><td className={`py-1 ${t.side === 'Long' ? 'text-up' : 'text-down'}`}>{t.side}</td>
                        <td className="num py-1 text-right">{t.qty}</td><td className="num py-1 text-right">{num2(t.entryPrice)}</td><td className="num py-1 text-right">{num2(t.exitPrice)}</td>
                        <td className="num py-1 text-right text-muted">{num2(res.charges.total)}</td><td className={`num py-1 text-right font-semibold ${tone(res.net)}`}>{num2(res.net)}</td>
                        <td className="num py-1 text-right">{res.rMultiple ?? '–'}</td><td className="py-1 pl-4 text-muted">{t.setup}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-line pt-2 text-[10px] text-muted">Figures are after brokerage, STT, exchange charges, SEBI fee, stamp duty and GST, using the rates in your settings. Past results are not a guide to future results.</p>
          </>
        )}
      </div>
      <button className="no-print hidden" onClick={() => navigate('/')} aria-hidden="true" tabIndex={-1} />
    </div>
  )
}
