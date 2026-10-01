import { useEffect, useMemo, useState } from 'react'
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Settings } from '../lib/types'
import { summarize, type Row } from '../lib/stats'
import { advice, breakevenRR, breakevenWinRate, clampInput, DEFAULT_SIM, expectancyGrid, expectancyMoney, expectancyR, kellyPct, RRS, simulate, WIN_RATES, type SimInput, type SimResult } from '../lib/simulator'
import { inr, pct } from '../lib/format'
import { axisTick } from '../lib/theme'
import Tabs from './Tabs'

const KEY = 'tj-sim-pro'
const c = { up: 'var(--up)', down: 'var(--down)', accent: 'var(--accent)', accent2: 'var(--accent2)', muted: 'var(--muted)', line: 'var(--line)' }
const axis = { ...axisTick, fill: 'var(--muted)' }
const money = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${inr(Math.abs(Math.round(n)))}`
const tone = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : '')
const fmtK = (v: number) => (Math.abs(v) >= 100000 ? `${(v / 100000).toFixed(1)}L` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)))

const PRO: SimInput = { ...DEFAULT_SIM, riskMode: 'pct', risk: 1, capital: 100000 }
const load = (): { a: SimInput; b: { winRate: number; rr: number } } => {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (x?.a) return { a: clampInput({ ...PRO, ...x.a }), b: { winRate: Number(x.b?.winRate) || 35, rr: Number(x.b?.rr) || 3 } }
  } catch { /* fall through */ }
  return { a: PRO, b: { winRate: 35, rr: 3 } }
}

type TabId = 'overview' | 'risk' | 'compare' | 'map'
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'risk', label: 'Risk' }, { id: 'compare', label: 'Compare styles' }, { id: 'map', label: 'Profit map' },
]
const PRESETS: { label: string; patch: Partial<SimInput> }[] = [
  { label: 'Coin flip', patch: { winRate: 50, rr: 1 } }, { label: 'Trend follower', patch: { winRate: 35, rr: 3 } },
  { label: 'Balanced', patch: { winRate: 45, rr: 1.5 } }, { label: 'Scalper', patch: { winRate: 65, rr: 0.6 } },
]

function Slider({ label, value, min, max, step, onChange, suffix, prefix, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; suffix?: string; prefix?: string; hint?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2"><label className="label !mb-0" htmlFor={`p-${label}`}>{label}</label>{hint && <span className="text-[11px] text-muted">{hint}</span>}</div>
      <div className="flex items-center gap-3">
        <input type="range" aria-label={`${label} slider`} className="h-1.5 flex-1 cursor-pointer accent-[var(--accent)]" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(Number(e.target.value))} />
        <div className="flex w-32 shrink-0 items-center gap-1 whitespace-nowrap">
          {prefix && <span className="text-sm text-muted">{prefix}</span>}
          <input id={`p-${label}`} type="number" className="input num !py-1.5 text-right" min={min} step={step} value={Number.isFinite(value) ? value : ''} onFocus={(e) => e.target.select()} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
          {suffix && <span className="text-sm text-muted">{suffix}</span>}
        </div>
      </div>
    </div>
  )
}
const Num = ({ id, label, hint, value, onChange, prefix, suffix }: { id: string; label: string; hint?: string; value: number; onChange: (n: number) => void; prefix?: string; suffix?: string }) => (
  <div>
    <label className="label" htmlFor={id}>{label}</label>
    <div className="flex items-center gap-1.5">{prefix && <span className="text-sm text-muted">{prefix}</span>}<input id={id} type="number" min={0} className="input num" value={value || ''} placeholder="Off" onFocus={(e) => e.target.select()} onChange={(e) => onChange(Number(e.target.value))} />{suffix && <span className="text-sm text-muted">{suffix}</span>}</div>
    {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
  </div>
)
const Tile = ({ label, value, sub, className = '' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) => (
  <div className="card"><div className="label">{label}</div><div className={`num whitespace-nowrap text-2xl font-semibold tracking-tight ${className}`}>{value}</div>{sub && <div className="mt-1 text-xs text-muted">{sub}</div>}</div>
)

export default function SimulatorPro({ rows, settings }: { rows: Row[]; settings: Settings }) {
  const [state, setState] = useState(() => (typeof localStorage === 'undefined' ? { a: PRO, b: { winRate: 35, rr: 3 } } : load()))
  const [tab, setTab] = useState<TabId>('overview')
  const [fromJournal, setFromJournal] = useState<number | null>(null)
  const inp = state.a
  const set = (patch: Partial<SimInput>) => { setState((s) => ({ ...s, a: { ...s.a, ...patch } })); setFromJournal(null) }
  useEffect(() => { try { const { seed: _s, ...a } = state.a; localStorage.setItem(KEY, JSON.stringify({ a, b: state.b })) } catch { /* ignore */ } }, [state])

  const input = useMemo(() => clampInput(inp), [inp])
  // The simulation can take a moment (thousands of futures), so it runs just after the screen has updated, with a loader showing.
  // Until the first run finishes, a tiny quick run stands in so the page can draw.
  const quick = useMemo(() => simulate({ ...input, runs: 50, trades: Math.min(input.trades, 30) }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [done, setDone] = useState<{ a: SimResult; b: SimResult | null } | null>(null)
  const [busy, setBusy] = useState(true)
  useEffect(() => {
    setBusy(true)
    const id = setTimeout(() => {
      const a = simulate(input)
      const bb = tab === 'compare' ? simulate({ ...input, winRate: state.b.winRate, rr: state.b.rr }) : null
      setDone({ a, b: bb })
      setBusy(false)
    }, 220) // also waits for a pause in typing or dragging a slider
    return () => clearTimeout(id)
  }, [input, tab, state.b])
  const result = done?.a ?? quick
  const s = result.summary
  const riskAmount = input.riskMode === 'fixed' ? input.risk : (input.capital * input.risk) / 100
  const adv = advice(input, riskAmount)
  const perTrade = expectancyMoney(input, riskAmount)
  const kelly = kellyPct(input.winRate, input.rr)
  const riskPct = (riskAmount / input.capital) * 100

  const useJournal = () => {
    const st = summarize(rows)
    if (!st.count) return
    const months = new Set(rows.map((r) => r.trade.date.slice(0, 7))).size || 1
    setState((x) => ({ ...x, a: { ...x.a, winRate: Math.round(st.winRate * 10) / 10, rr: st.avgLoss > 0 ? Math.round((st.avgWin / st.avgLoss) * 100) / 100 : x.a.rr, riskMode: 'fixed', risk: Math.max(1, Math.round(st.avgLoss)), charges: Math.round((st.charges / st.count) * 100) / 100, trades: Math.max(10, Math.min(500, Math.round(st.count / months))), capital: settings.startingCapital || x.a.capital } }))
    setFromJournal(st.count)
  }

  const fan = useMemo(() => result.bands.map((b, i) => ({ step: b.step, p10: b.p10, p50: b.p50, p90: b.p90, band: [b.p10, b.p90] as [number, number], ...Object.fromEntries(result.samples.map((p, k) => [`s${k}`, p[i]])) })), [result])
  const hist = result.hist.map((h) => ({ mid: (h.from + h.to) / 2, from: h.from, to: h.to, count: h.count }))

  // Style B for the comparison tab (same capital, risk and costs; only win rate and reward : risk differ)
  const b = state.b
  const resultB = tab === 'compare' ? done?.b ?? null : null
  const cmp = useMemo(() => (resultB ? result.bands.map((x, i) => ({ step: x.step, a: x.p50, b: resultB.bands[i].p50, aLo: x.p10, aHi: x.p90, bLo: resultB.bands[i].p10, bHi: resultB.bands[i].p90 })) : []), [result, resultB])
  const grid = useMemo(() => expectancyGrid(), [])
  const nearWin = WIN_RATES.reduce((a, w) => (Math.abs(w - input.winRate) < Math.abs(a - input.winRate) ? w : a), WIN_RATES[0])
  const nearRR = RRS.reduce((a, r) => (Math.abs(r - input.rr) < Math.abs(a - input.rr) ? r : a), RRS[0])
  const download = () => {
    const head = 'trade,p10,median,p90\n'
    const body = result.bands.map((x) => `${x.step},${Math.round(x.p10)},${Math.round(x.p50)},${Math.round(x.p90)}`).join('\n')
    const blob = new Blob([head + body], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'simulation.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      {/* Controls */}
      <div className="card h-fit space-y-5 lg:sticky lg:top-4">
        <p className="rounded-lg bg-accent/10 px-3 py-2 text-xs">New here? Press <b>? How to use</b> at the top right for a 1-minute guide.</p>
        <div>
          <span className="label">Quick start</span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => <button key={p.label} type="button" onClick={() => set(p.patch)} className={`chip transition hover:border-accent/60 ${input.winRate === p.patch.winRate && input.rr === p.patch.rr ? '!border-accent !bg-accent/15 !text-fg' : ''}`}>{p.label}</button>)}
            <button type="button" className="chip transition hover:border-accent/60 disabled:opacity-40" disabled={rows.length === 0} onClick={useJournal}>My journal numbers</button>
          </div>
          {fromJournal !== null && <p className="mt-2 text-xs text-muted">Filled in from your {fromJournal} trades.{fromJournal < 30 ? ' A small sample, so treat it as rough.' : ''}</p>}
        </div>
        <Slider label="Win rate" value={inp.winRate} min={0} max={100} step={1} suffix="%" onChange={(n) => set({ winRate: n })} hint="out of every 100 trades" />
        <Slider label="Reward : risk" value={inp.rr} min={0.1} max={5} step={0.05} prefix="1 :" onChange={(n) => set({ rr: n })} hint="a win pays this × a loss" />
        <div>
          <span className="label">Risk on each trade</span>
          <div className="seg mb-3" role="group" aria-label="How risk is set">
            <button type="button" aria-pressed={inp.riskMode === 'pct'} onClick={() => set({ riskMode: 'pct', risk: inp.riskMode === 'pct' ? inp.risk : 1 })}>% of capital</button>
            <button type="button" aria-pressed={inp.riskMode === 'fixed'} onClick={() => set({ riskMode: 'fixed', risk: inp.riskMode === 'fixed' ? inp.risk : Math.round(inp.capital / 100) })}>Fixed ₹</button>
          </div>
          {inp.riskMode === 'pct'
            ? <Slider label="Risk each trade" value={inp.risk} min={0.1} max={10} step={0.1} suffix="%" onChange={(n) => set({ risk: n })} hint={`about ${inr(Math.round(riskAmount))} at the start`} />
            : <Slider label="Risk each trade" value={inp.risk} min={100} max={Math.max(10000, Math.round(inp.capital / 10))} step={100} prefix="₹" onChange={(n) => set({ risk: n })} hint={`${riskPct.toFixed(2)}% of capital`} />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Num id="p-trades" label="Trades" value={inp.trades} onChange={(n) => set({ trades: n })} />
          <Num id="p-cap" label="Capital (₹)" value={inp.capital} onChange={(n) => set({ capital: n })} />
        </div>

        <details className="group rounded-xl border border-line px-3.5 py-3">
          <summary className="cursor-pointer list-none text-sm font-semibold">Costs &amp; realism <span className="float-right text-muted transition group-open:rotate-90">›</span></summary>
          <div className="mt-4 space-y-4">
            <Num id="p-charges" label="Charges per trade" value={inp.charges} prefix="₹" onChange={(n) => set({ charges: n })} hint="Brokerage, taxes and fees on every trade." />
            <Slider label="Variation" value={Math.round(inp.variation * 100)} min={0} max={90} step={5} suffix="%" onChange={(n) => set({ variation: n / 100 })} hint="trades are never exact" />
            <p className="-mt-2 text-[11px] text-muted">Winners land within ± this much of the target; losers can slip past the stop by up to this much.</p>
          </div>
        </details>
        <details className="group rounded-xl border border-line px-3.5 py-3">
          <summary className="cursor-pointer list-none text-sm font-semibold">Daily rules &amp; goal <span className="float-right text-muted transition group-open:rotate-90">›</span></summary>
          <div className="mt-4 space-y-4">
            <Num id="p-tpd" label="Trades per day" value={inp.tradesPerDay} onChange={(n) => set({ tradesPerDay: n })} hint="Needed for the two rules below." />
            <Num id="p-stop" label="Stop for the day after losses in a row" value={inp.stopAfterLosses} suffix="losses" onChange={(n) => set({ stopAfterLosses: n })} />
            <Num id="p-dlr" label="Stop for the day once down" value={inp.dailyLossR} suffix="R" onChange={(n) => set({ dailyLossR: n })} />
            <Num id="p-goal" label="Profit goal" value={inp.goal} prefix="₹" onChange={(n) => set({ goal: n })} hint="Shows your chance of reaching it." />
          </div>
        </details>
        <details className="group rounded-xl border border-line px-3.5 py-3">
          <summary className="cursor-pointer list-none text-sm font-semibold">Simulation <span className="float-right text-muted transition group-open:rotate-90">›</span></summary>
          <div className="mt-4 space-y-4">
            <div><label className="label" htmlFor="p-runs">Futures to simulate</label>
              <select id="p-runs" className="input" value={inp.runs} onChange={(e) => set({ runs: Number(e.target.value) })}>{[200, 500, 1000, 2000, 5000].map((n) => <option key={n} value={n}>{n.toLocaleString('en-IN')}</option>)}</select></div>
            <Num id="p-seed" label="Random seed" value={inp.seed} onChange={(n) => set({ seed: Math.max(1, Math.round(n)) })} hint="The same seed gives the same results." />
          </div>
        </details>
        <div className="flex gap-2">
          <button type="button" className="btn flex-1" onClick={() => set({ seed: inp.seed + 1 })}>↻ Re-roll</button>
          <button type="button" className="btn-ghost" onClick={() => { setState({ a: PRO, b: { winRate: 35, rr: 3 } }); setFromJournal(null) }} title="Back to the starting numbers">Reset</button>
        </div>
      </div>

      {/* Results */}
      <div className="relative min-w-0 space-y-5" aria-busy={busy}>
        {busy && (
          <div role="status" className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-24">
            <div className="flex items-center gap-3 rounded-full border border-line bg-panel px-5 py-3 text-sm font-medium shadow-lg">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent/25 border-t-accent" aria-hidden="true" />
              Simulating {input.runs.toLocaleString('en-IN')} futures…
            </div>
          </div>
        )}
        <div className={`space-y-5 transition-opacity duration-200 ${busy ? 'opacity-40' : ''}`}>
        <div className={`rounded-2xl border px-5 py-4 ${adv.profitable ? 'border-up/40 bg-up/10' : 'border-down/40 bg-down/10'}`} role="status">
          <div className="font-display text-lg font-semibold">{adv.profitable ? 'This style has an edge' : 'This style loses money over time'}</div>
          <p className="mt-1 text-sm">Each trade averages <b className={`num ${tone(perTrade)}`}>{money(perTrade)}</b> (<span className="num">{adv.netR >= 0 ? '+' : ''}{adv.netR.toFixed(2)}R</span>). {pct(s.profitablePct)} of {input.runs.toLocaleString('en-IN')} simulations ended in profit.
            {!adv.profitable && <> You would need a win rate of <b className="num">{Math.min(100, adv.needWinRate).toFixed(1)}%</b> at 1 : {input.rr}, or <b className="num">1 : {Number.isFinite(adv.needRR) ? adv.needRR.toFixed(2) : '∞'}</b> at {input.winRate}% wins.</>}</p>
        </div>

        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Simulator sections" size="sm" />

        {tab === 'overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Tile label="Chance of profit" value={pct(s.profitablePct)} className={s.profitablePct >= 50 ? 'text-up' : 'text-down'} sub={`${input.runs.toLocaleString('en-IN')} futures`} />
              <Tile label="Median result" value={money(s.median - input.capital)} className={tone(s.median - input.capital)} sub={`Mean ${money(s.mean - input.capital)}`} />
              <Tile label="Range (90%)" value={`${fmtK(s.p5 - input.capital)} to ${fmtK(s.p95 - input.capital)}`} sub={`Best ${money(s.best - input.capital)} · worst ${money(s.worst - input.capital)}`} />
              <Tile label={s.goalPct === null ? 'Return on capital' : 'Chance of goal'} value={s.goalPct === null ? pct(((s.median - input.capital) / input.capital) * 100) : pct(s.goalPct)} className={s.goalPct === null ? tone(s.median - input.capital) : ''} sub={s.goalPct === null ? 'median, over the whole run' : `reaching ${inr(input.goal)} profit`} />
            </div>
            <div className="card">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div><h3 className="text-base font-bold">Your account over {input.trades} trades</h3><p className="text-xs text-muted">Blue is the typical path. The shaded area holds 8 in 10 outcomes. Thin lines are single futures.</p></div>
                <button type="button" className="btn-ghost !py-1 text-xs" onClick={download}>Download CSV</button>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={fan} margin={{ left: 4, right: 8, top: 6 }}>
                  <CartesianGrid stroke={c.line} strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="step" tick={axis} tickLine={false} axisLine={false} minTickGap={32} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={52} domain={['auto', 'auto']} tickFormatter={fmtK} />
                  <ReferenceLine y={input.capital} stroke={c.muted} strokeDasharray="4 4" strokeOpacity={0.7} />
                  {input.goal > 0 && <ReferenceLine y={input.capital + input.goal} stroke={c.up} strokeDasharray="2 4" label={{ value: 'goal', position: 'insideTopLeft', fill: 'var(--up)', fontSize: 11 }} />}
                  <Area type="monotone" dataKey="band" stroke="none" fill={c.accent} fillOpacity={0.14} isAnimationActive={false} />
                  {result.samples.map((_, k) => <Line key={k} type="monotone" dataKey={`s${k}`} stroke={c.muted} strokeOpacity={0.28} strokeWidth={1} dot={false} isAnimationActive={false} />)}
                  <Line type="monotone" dataKey="p50" stroke={c.accent} strokeWidth={2.6} dot={false} isAnimationActive={false} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as { step: number; p10: number; p50: number; p90: number }
                    return <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg"><div className="mb-1 font-semibold">After {d.step} trades</div><div className="num text-up">Lucky 10%: {inr(Math.round(d.p90))}</div><div className="num font-semibold">Median: {inr(Math.round(d.p50))}</div><div className="num text-down">Unlucky 10%: {inr(Math.round(d.p10))}</div></div>
                  }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h3 className="text-base font-bold">How the {input.runs.toLocaleString('en-IN')} futures ended</h3>
              <p className="mb-3 text-xs text-muted">Each bar counts the futures that finished with that profit or loss.</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hist} margin={{ left: 4, right: 8 }} barCategoryGap={2}>
                  <CartesianGrid stroke={c.line} strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="mid" tick={axis} tickLine={false} axisLine={false} tickFormatter={fmtK} minTickGap={24} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={34} allowDecimals={false} />
                  <ReferenceLine x={0} stroke={c.muted} />
                  <Tooltip cursor={{ fill: 'rgba(138,143,174,0.10)' }} content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as { from: number; to: number; count: number }
                    return <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg"><div className="num font-semibold">{money(d.from)} to {money(d.to)}</div><div>{d.count} futures ({((d.count / input.runs) * 100).toFixed(1)}%)</div></div>
                  }} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>{hist.map((h, i) => <Cell key={i} fill={(h.from + h.to) / 2 >= 0 ? c.up : c.down} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {tab === 'risk' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Tile label="Typical worst dip" value={`-${s.avgMaxDrawdownPct.toFixed(1)}%`} className="text-down" sub={`1 in 20 runs: ${s.p95MaxDrawdownPct.toFixed(0)}% or worse`} />
              <Tile label="Typical losing streak" value={`${s.medianLossStreak}`} sub={`1 in 20 hits ${s.p95LossStreak}; worst ${s.worstLossStreak}`} />
              <Tile label="Account wiped out" value={`${s.wipedOutPct.toFixed(s.wipedOutPct > 0 && s.wipedOutPct < 1 ? 1 : 0)}%`} className={s.wipedOutPct > 0 ? 'text-down' : ''} sub="of simulated futures" />
              <Tile label="Trades skipped" value={`${s.skippedPct.toFixed(0)}%`} sub={input.tradesPerDay > 0 ? 'stopped by your daily rules' : 'no daily rules set'} />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="card">
                <h3 className="text-base font-bold">How often you fall this far</h3>
                <p className="mb-3 text-xs text-muted">Share of futures that drop at least this much from their peak at some point.</p>
                <ul className="space-y-2.5">
                  {s.ruin.map((r) => (
                    <li key={r.drawdown} className="flex items-center gap-3 text-sm">
                      <span className="w-24 shrink-0 text-muted">Down {r.drawdown}%</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${r.pct > 30 ? 'bg-down' : r.pct > 10 ? 'bg-warn' : 'bg-up'}`} style={{ width: `${Math.max(r.pct > 0 ? 2 : 0, r.pct)}%` }} /></div>
                      <span className="num w-12 shrink-0 text-right font-medium">{r.pct.toFixed(r.pct > 0 && r.pct < 1 ? 1 : 0)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card">
                <h3 className="text-base font-bold">Sizing your risk</h3>
                <dl className="mt-3 space-y-2.5 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-muted">You risk now</dt><dd className="num font-semibold">{riskPct.toFixed(2)}% · {inr(Math.round(riskAmount))}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted">Kelly (fastest growth)</dt><dd className="num font-semibold">{kelly.toFixed(1)}%</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted">Half Kelly (safer)</dt><dd className="num font-semibold">{(kelly / 2).toFixed(1)}%</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted">{kelly <= 0 ? 'With no edge, the safest size is zero. Kelly says to risk nothing until the numbers improve.' : riskPct > kelly ? 'You risk more than Kelly, which raises swings and the chance of ruin. Many traders use half Kelly or less.' : 'You risk less than Kelly. That is the cautious side.'}</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'compare' && resultB && (
          <div className="space-y-5">
            <div className="card">
              <h3 className="text-base font-bold">Compare two styles</h3>
              <p className="mb-4 text-xs text-muted">Same capital, risk and costs. Only the win rate and reward : risk differ.</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="rounded-xl border border-accent/40 bg-accent/5 p-4"><div className="mb-2 text-sm font-semibold text-accent">Style A (your numbers)</div><div className="num text-sm">{inp.winRate}% wins · 1 : {inp.rr}</div></div>
                <div className="rounded-xl border border-line p-4">
                  <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--accent2)' }}>Style B</div>
                  <div className="space-y-3">
                    <Slider label="B win rate" value={b.winRate} min={0} max={100} step={1} suffix="%" onChange={(n) => setState((x) => ({ ...x, b: { ...x.b, winRate: n } }))} />
                    <Slider label="B reward : risk" value={b.rr} min={0.1} max={5} step={0.05} prefix="1 :" onChange={(n) => setState((x) => ({ ...x, b: { ...x.b, rr: n } }))} />
                  </div>
                </div>
              </div>
            </div>
            <div className="card">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={cmp} margin={{ left: 4, right: 8, top: 6 }}>
                  <CartesianGrid stroke={c.line} strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="step" tick={axis} tickLine={false} axisLine={false} minTickGap={32} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={52} domain={['auto', 'auto']} tickFormatter={fmtK} />
                  <ReferenceLine y={input.capital} stroke={c.muted} strokeDasharray="4 4" strokeOpacity={0.7} />
                  <Line type="monotone" dataKey="a" name="Style A" stroke={c.accent} strokeWidth={2.8} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="b" name="Style B" stroke={c.accent2} strokeWidth={2.8} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
                  <Tooltip formatter={(v) => inr(Math.round(Number(v)))} labelFormatter={(l) => `After ${l} trades (median)`} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="mt-2 flex gap-4 text-xs"><span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded" style={{ background: c.accent }} /> Style A</span><span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded" style={{ background: c.accent2 }} /> Style B</span></div>
            </div>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead className="text-xs text-muted"><tr><th className="py-2 text-left font-medium" /><th className="py-2 text-right font-medium">Style A</th><th className="py-2 text-right font-medium">Style B</th></tr></thead>
                <tbody>
                  {([
                    ['Win rate · reward : risk', `${inp.winRate}% · 1:${inp.rr}`, `${b.winRate}% · 1:${b.rr}`],
                    ['Chance of profit', pct(s.profitablePct), pct(resultB.summary.profitablePct)],
                    ['Median result', money(s.median - input.capital), money(resultB.summary.median - input.capital)],
                    ['Average per trade (R)', `${expectancyR(inp.winRate, inp.rr).toFixed(2)}R`, `${expectancyR(b.winRate, b.rr).toFixed(2)}R`],
                    ['Typical worst dip', `-${s.avgMaxDrawdownPct.toFixed(1)}%`, `-${resultB.summary.avgMaxDrawdownPct.toFixed(1)}%`],
                    ['Typical losing streak', String(s.medianLossStreak), String(resultB.summary.medianLossStreak)],
                  ] as const).map(([k, a, bb]) => <tr key={k} className="border-t border-line/70"><td className="py-2.5 text-muted">{k}</td><td className="num py-2.5 text-right font-medium">{a}</td><td className="num py-2.5 text-right font-medium">{bb}</td></tr>)}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted">Break-even for A is {breakevenWinRate(inp.rr).toFixed(0)}% wins at 1:{inp.rr}; for B it is {breakevenWinRate(b.rr).toFixed(0)}% wins at 1:{b.rr}.</p>
            </div>
          </div>
        )}

        {tab === 'map' && (
          <div className="card">
            <h3 className="text-base font-bold">The profit map</h3>
            <p className="mb-3 text-xs text-muted">Average result of one trade in R, for every mix of win rate and reward : risk. Green makes money, red loses. Your numbers are outlined.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-separate border-spacing-1 text-center text-xs">
                <thead><tr><th className="px-1 text-left font-medium text-muted">Reward : risk ↓ / Win rate →</th>{WIN_RATES.map((w) => <th key={w} className={`font-medium ${w === nearWin ? 'text-fg' : 'text-muted'}`}>{w}%</th>)}</tr></thead>
                <tbody>
                  {RRS.map((rr, ri) => (
                    <tr key={rr}>
                      <th className={`px-1 text-left font-medium ${rr === nearRR ? 'text-fg' : 'text-muted'}`}>1 : {rr}</th>
                      {WIN_RATES.map((w, wi) => {
                        const e = grid[ri][wi]
                        return <td key={w} title={`${w}% wins at 1 : ${rr} → ${e >= 0 ? '+' : ''}${e.toFixed(2)}R per trade (${money(e * riskAmount)} at ${inr(Math.round(riskAmount))} risked)`}
                          style={{ background: `color-mix(in srgb, var(${e >= 0 ? '--up' : '--down'}) ${Math.round(Math.min(0.55, Math.abs(e) * 0.9) * 100)}%, transparent)` }}
                          className={`num rounded-md py-2 font-medium ${w === nearWin && rr === nearRR ? 'outline outline-2 outline-offset-1 outline-[var(--accent)]' : ''}`}>{e >= 0 ? '+' : ''}{e.toFixed(2)}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">Break-even reward : risk at {input.winRate}% wins is {Number.isFinite(breakevenRR(input.winRate)) ? `1 : ${breakevenRR(input.winRate).toFixed(2)}` : 'never'}. Charges are not in the map but are in the numbers elsewhere. A simulation is a what-if, not a forecast.</p>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
