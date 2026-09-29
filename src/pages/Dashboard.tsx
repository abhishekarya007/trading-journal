import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Settings } from '../lib/types'
import { equityCurve, groupNet, summarize, type Row } from '../lib/stats'
import { chronological } from '../lib/insights'
import { addDays, localDate, weekDays, weekStart } from '../lib/week'
import { inr, pnlColor } from '../lib/format'
import { axisTick, COLORS, tooltipStyle } from '../lib/theme'
import { nseStatus } from '../lib/market'
import { evaluateDay } from '../lib/risk'
import { monthlyCapital } from '../lib/capital'
import CoachCard from '../components/CoachCard'
import Tabs from '../components/Tabs'
import AnimatedNumber from '../components/AnimatedNumber'
import Ring from '../components/Ring'
import Sparkline from '../components/Sparkline'
import Stat from '../components/Stat'
import BarPnl from '../components/BarPnl'
import Calendar from '../components/Calendar'
import RiskBanner from '../components/RiskBanner'
import SymbolAvatar from '../components/SymbolAvatar'
import { IconBolt, IconDown, IconPlus, IconScale, IconWallet } from '../components/Icons'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
type PerfTab = 'equity' | 'calendar' | 'breakdown'
const PERF_TABS: { id: PerfTab; label: string }[] = [
  { id: 'equity', label: 'Cumulative P&L' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'breakdown', label: 'Weekday & setup' },
]
const RANGES = [['1M', 30], ['3M', 90], ['6M', 180], ['All', 0]] as const

const signed = (n: number, d = 0) => (n > 0 ? '+' : '') + inr(n, d)
const glow = (n: number) => (n > 0 ? 'glow-up' : n < 0 ? 'glow-down' : '')
const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function Mini({ label, value, className = '', sub }: { label: string; value: ReactNode; className?: string; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line/80 bg-panel2/50 px-3 py-2 backdrop-blur">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`num mt-0.5 text-sm font-semibold ${className}`}>{value}</div>
      {sub && <div className="num mt-0.5 text-[10px] text-muted">{sub}</div>}
    </div>
  )
}

function form(rows: Row[]) {
  const seq = chronological(rows).map((r) => r.res.net).filter((n) => n !== 0)
  let run = 0, bestW = 0, worstL = 0
  for (const n of seq) {
    run = n > 0 ? (run > 0 ? run + 1 : 1) : run < 0 ? run - 1 : -1
    bestW = Math.max(bestW, run)
    worstL = Math.min(worstL, run)
  }
  const days = new Map<string, number>()
  for (const r of rows) days.set(r.trade.date, (days.get(r.trade.date) ?? 0) + r.res.net)
  const dayList = [...days.entries()]
  const bestDay = dayList.reduce<[string, number] | null>((b, d) => (!b || d[1] > b[1] ? d : b), null)
  const worstDay = dayList.reduce<[string, number] | null>((b, d) => (!b || d[1] < b[1] ? d : b), null)
  return { cur: run, bestW, worstL: -worstL, last: seq.slice(-28), bestDay, worstDay }
}

export default function Dashboard({ rows, settings, onAdd }: { rows: Row[]; settings: Settings; onAdd: () => void }) {
  const navigate = useNavigate()
  const [range, setRange] = useState<(typeof RANGES)[number][0]>('All')
  const [perf, setPerf] = useState<PerfTab>(() => {
    try { const v = localStorage.getItem('tj-perf-tab'); return PERF_TABS.some((t) => t.id === v) ? (v as PerfTab) : 'equity' } catch { return 'equity' }
  })
  const setPerfTab = (t: PerfTab) => {
    setPerf(t)
    try { localStorage.setItem('tj-perf-tab', t) } catch { /* ignore */ }
  }
  const todayKey = localDate()

  const s = useMemo(() => summarize(rows), [rows])
  const caps = useMemo(() => monthlyCapital(rows, settings, todayKey.slice(0, 7)), [rows, settings, todayKey])
  const monthCap = caps.get(todayKey.slice(0, 7))
  const periods = useMemo(() => {
    const week = weekDays(weekStart(todayKey))
    const pick = (f: (d: string) => boolean) => summarize(rows.filter((r) => f(r.trade.date)))
    return {
      today: pick((d) => d === todayKey),
      week: pick((d) => week.includes(d)),
      month: pick((d) => d.startsWith(todayKey.slice(0, 7))),
    }
  }, [rows, todayKey])

  const curve = useMemo(() => {
    // Cumulative net P&L (starts at 0): there is no account balance, only each month's fixed capital.
    let peak = 0
    return equityCurve(rows, 0).map((p) => {
      peak = Math.max(peak, p.equity)
      return { ...p, dd: Math.round((p.equity - peak) * 100) / 100 }
    })
  }, [rows])
  const shownCurve = useMemo(() => {
    const days = RANGES.find((r) => r[0] === range)![1]
    if (!days) return curve
    const cutoff = addDays(todayKey, -days)
    return curve.filter((p) => p.date >= cutoff)
  }, [curve, range, todayKey])

  const cumNet = useMemo(() => curve.map((p) => p.equity), [curve])
  const f = useMemo(() => form(rows), [rows])
  const wins = rows.filter((r) => r.res.net > 0).length
  const losses = rows.filter((r) => r.res.net < 0).length
  const byDay = useMemo(() => {
    const g = groupNet(rows, (r) => [DAYS[new Date(r.trade.date + 'T00:00:00').getDay()]])
    return DAY_ORDER.map((d) => g.find((x) => x.name === d)).filter((x): x is NonNullable<typeof x> => !!x)
  }, [rows])
  const bySetup = useMemo(() => groupNet(rows, (r) => [r.trade.setup || 'None']), [rows])
  const recent = useMemo(() => chronological(rows).slice(-6).reverse(), [rows])
  const warnings = useMemo(() => evaluateDay(rows, todayKey, settings.risk), [rows, todayKey, settings.risk])
  const market = nseStatus()
  const dateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const lastEquity = curve.length ? curve[curve.length - 1].equity : 0
  const lastMax = Math.max(1, ...f.last.map(Math.abs))

  const header = (
    <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm text-muted">{greeting()} 👋</p>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-gradient md:text-[34px]">Your trading desk</h1>
        <p className="mt-0.5 text-xs text-muted">{dateLabel}</p>
      </div>
      <span className="chip"><span className={`dot ${market.open ? 'dot-live' : ''}`} /> NSE · {market.label}</span>
    </div>
  )

  if (rows.length === 0)
    return (
      <div className="card relative overflow-hidden py-10 md:p-10">
        {header}
        <div className="relative z-10 mx-auto mt-10 max-w-md text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent"><IconBolt /></div>
          <h2 className="font-display text-xl font-semibold">Log your first trade</h2>
          <p className="mt-2 text-sm text-muted">Charges, R-multiples, streaks and insights are calculated automatically as you add trades.</p>
          <button className="btn mt-6" onClick={onAdd}><IconPlus /> Add trade <span className="rounded bg-white/20 px-1.5 font-mono text-[10px]">N</span></button>
        </div>
      </div>
    )

  return (
    <div className="space-y-5">
      <RiskBanner warnings={warnings} title="Today's risk rules" />

      {/* Hero + win rate */}
      <div className="stagger grid gap-5 lg:grid-cols-3">
        <div className="card relative overflow-hidden lg:col-span-2">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
            style={{ background: `color-mix(in srgb, var(${periods.today.net >= 0 ? '--up' : '--down'}) 16%, transparent)` }} />
          {header}
          <div className="relative z-10 mt-7">
            <div className="label">Today&apos;s net P&amp;L</div>
            <div className={`num text-5xl font-semibold tracking-tight md:text-6xl ${pnlColor(periods.today.net)} ${glow(periods.today.net)}`}>
              <AnimatedNumber value={periods.today.net} format={(n) => signed(n)} />
            </div>
            <p className="mt-2 text-sm text-muted">
              {periods.today.count} {periods.today.count === 1 ? 'trade' : 'trades'}
              {periods.today.count > 0 && <> · {periods.today.winRate.toFixed(0)}% win rate · charges {inr(periods.today.charges)}</>}
            </p>
          </div>
          <div className="relative z-10 mt-6 grid max-w-xl grid-cols-3 gap-2.5 pb-16 md:pb-20">
            <Mini label="This week" value={signed(periods.week.net)} className={pnlColor(periods.week.net)} />
            <Mini label="This month" value={signed(periods.month.net)} className={pnlColor(periods.month.net)}
              sub={monthCap && monthCap.capital > 0 ? <><span className={pnlColor(monthCap.returnPct)}>{monthCap.returnPct > 0 ? '+' : ''}{monthCap.returnPct.toFixed(2)}%</span> on {inr(monthCap.capital)}</> : undefined} />
            <Mini label="All time" value={signed(s.net)} className={pnlColor(s.net)} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 opacity-80">
            <Sparkline values={cumNet.slice(-60)} tone={s.net >= 0 ? 'up' : 'down'} height={110} />
          </div>
        </div>

        <div className="card flex flex-col">
          <div className="label">Win rate</div>
          <div className="flex flex-1 items-center justify-center py-3">
            <Ring value={s.winRate} size={168}>
              <div className="num text-3xl font-semibold"><AnimatedNumber value={s.winRate} format={(n) => `${n.toFixed(1)}%`} /></div>
              <div className="mt-0.5 text-[11px] text-muted"><span className="text-up">{wins}W</span> · <span className="text-down">{losses}L</span></div>
            </Ring>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Mini label="Avg win" value={inr(s.avgWin)} className="text-up" />
            <Mini label="Avg loss" value={inr(s.avgLoss)} className="text-down" />
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Net P&L" icon={<IconWallet />} value={<AnimatedNumber value={s.net} format={(n) => signed(n)} />} className={pnlColor(s.net)}
          sub={`${s.count} trades · ${inr(s.charges)} charges`} spark={cumNet} tone={s.net >= 0 ? 'up' : 'down'} />
        <Stat label="Profit factor" icon={<IconScale />} value={Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}
          className={s.profitFactor >= 1 ? 'text-up' : 'text-down'} sub="Gross wins ÷ gross losses" />
        <Stat label="Expectancy" icon={<IconBolt />} value={<AnimatedNumber value={s.expectancy} format={(n) => signed(n)} />} className={pnlColor(s.expectancy)}
          sub={s.avgR !== null ? `per trade · avg ${s.avgR.toFixed(2)}R` : 'per trade'} />
        <Stat label="Max drawdown" icon={<IconDown />} value={inr(s.maxDrawdown)} className="text-down"
          sub="Largest peak-to-trough fall" spark={curve.map((p) => p.dd)} tone="down" />
      </div>

      {/* Performance (tabbed) + what needs attention */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card min-h-[500px] lg:col-span-2">
          <div className="mb-4">
            <Tabs tabs={PERF_TABS} value={perf} onChange={setPerfTab} label="Performance views" size="sm" />
          </div>
          {perf === 'equity' && (
            <div className="rise">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Cumulative P&amp;L</h3>
              <p className="num text-xs text-muted"><span className={pnlColor(lastEquity)}>{signed(lastEquity)}</span> net across all trades</p>
            </div>
            <div className="seg" role="group" aria-label="Range">
              {RANGES.map(([k]) => <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{k}</button>)}
            </div>
          </div>
          {shownCurve.length < 2 ? <p className="py-20 text-center text-sm text-muted">Not enough trades in this range.</p> : (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={shownCurve} syncId="eq">
                  <defs>
                    <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={COLORS.accent2} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="eqStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={COLORS.accent} />
                      <stop offset="100%" stopColor={COLORS.accent2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis tick={axisTick} width={64} domain={['auto', 'auto']} tickLine={false} axisLine={false} tickFormatter={(v) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [inr(Number(v)), 'Cumulative P&L']} />
                  <Area dataKey="equity" stroke="url(#eqStroke)" strokeWidth={2.5} fill="url(#eqFill)" activeDot={{ r: 5, strokeWidth: 0, fill: COLORS.accent }} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-1 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-down" /> Drawdown</div>
              <ResponsiveContainer width="100%" height={70}>
                <AreaChart data={shownCurve} syncId="eq">
                  <defs>
                    <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.down} stopOpacity={0} />
                      <stop offset="100%" stopColor={COLORS.down} stopOpacity={0.45} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} minTickGap={40} />
                  <YAxis hide domain={['dataMin', 0]} width={64} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [inr(Number(v)), 'Drawdown']} />
                  <Area dataKey="dd" stroke={COLORS.down} strokeWidth={1.5} fill="url(#ddFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}

            </div>
          )}
          {perf === 'calendar' && <div className="rise"><Calendar rows={rows} caps={caps} bare /></div>}
          {perf === 'breakdown' && (
            <div className="rise grid gap-6 md:grid-cols-2">
              <BarPnl bare title="P&L by weekday" data={byDay} />
              <BarPnl bare title="P&L by setup" data={bySetup} />
            </div>
          )}
        </div>
        <div className="card flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent trades</h3>
            <button className="text-xs text-accent hover:underline" onClick={() => navigate('/trades')}>View all →</button>
          </div>
          <div className="-mx-2 flex flex-col">
            {recent.map(({ trade: t, res }) => (
              <button key={t.id} onClick={() => navigate('/trades', { state: { open: t.id } })}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-panel2/70">
                <SymbolAvatar symbol={t.symbol} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold tracking-wide">
                    {t.symbol}
                    <span className={`rounded px-1 py-px text-[9px] font-bold ${t.side === 'Long' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>{t.side === 'Long' ? 'L' : 'S'}</span>
                  </div>
                  <div className="truncate text-[11px] text-muted">{t.date}{t.entryTime ? ` · ${t.entryTime}` : ''} · {t.setup}</div>
                </div>
                <div className="text-right">
                  <div className={`num text-sm font-semibold ${pnlColor(res.net)}`}>{signed(res.net)}</div>
                  <div className="num text-[11px] text-muted">{res.rMultiple !== null ? `${res.rMultiple}R` : `${t.qty} qty`}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 [&>.card]:h-full">
          <CoachCard rows={rows} settings={settings} weekKey={weekStart(todayKey)} />
        </div>
        <div className="card flex flex-col">
          <div className="label">Current streak</div>
          <div className="flex items-baseline gap-2">
            <span className={`num text-5xl font-semibold ${f.cur > 0 ? 'text-up glow-up' : f.cur < 0 ? 'text-down glow-down' : ''}`}>{Math.abs(f.cur)}</span>
            <span className="text-sm text-muted">{f.cur > 0 ? `win${f.cur > 1 ? 's' : ''} in a row 🔥` : f.cur < 0 ? `loss${f.cur < -1 ? 'es' : ''} in a row` : 'no streak'}</span>
          </div>
          <div className="label mt-5">Last {f.last.length} trades</div>
          <div className="flex h-16 items-end gap-[3px]">
            {f.last.map((n, i) => (
              <div key={i} title={inr(n, 2)} className={`flex-1 rounded-t-[3px] ${n > 0 ? 'bg-up' : 'bg-down'}`}
                style={{ height: `${18 + 82 * (Math.abs(n) / lastMax)}%`, opacity: 0.45 + 0.55 * ((i + 1) / f.last.length) }} />
            ))}
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2.5 pt-5">
            <Mini label="Best streak" value={`${f.bestW} W`} className="text-up" />
            <Mini label="Worst streak" value={`${f.worstL} L`} className="text-down" />
            <Mini label="Best day" value={f.bestDay ? signed(f.bestDay[1]) : '–'} className="text-up" />
            <Mini label="Worst day" value={f.worstDay ? signed(f.worstDay[1]) : '–'} className={f.worstDay && f.worstDay[1] < 0 ? 'text-down' : ''} />
          </div>
        </div>
      </div>
    </div>
  )
}
