import { useEffect, useMemo, useState } from 'react'
import type { Settings } from '../lib/types'
import { summarize, type Row } from '../lib/stats'
import { advice, clampInput, DEFAULT_SIM, exampleRun, expectancyMoney, simulate, type SimInput } from '../lib/simulator'
import { inr } from '../lib/format'
import PageTitle from '../components/PageTitle'
import SimulatorPro from '../components/SimulatorPro'
import SimulatorHelp from '../components/SimulatorHelp'

const KEY = 'tj-sim2'
const money = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${inr(Math.abs(Math.round(n)))}`
const SIMPLE: SimInput = { ...DEFAULT_SIM, riskMode: 'fixed', risk: 1000, trades: 100, winRate: 45, rr: 1.5, charges: 0, variation: 0, runs: 1000 }

const load = (): SimInput => {
  try { return clampInput({ ...SIMPLE, ...(JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {}), riskMode: 'fixed', variation: 0, runs: 1000 }) } catch { return SIMPLE }
}

function Field({ label, hint, value, onChange, prefix, suffix, min = 0, step = 1 }: { label: string; hint?: string; value: number; onChange: (n: number) => void; prefix?: string; suffix?: string; min?: number; step?: number }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="ml-2 text-xs text-muted">{hint}</span>}
      <div className="mt-1.5 flex items-center gap-2">
        {prefix && <span className="text-sm text-muted">{prefix}</span>}
        <input type="number" className="input num" min={min} step={step} value={value || ''} onFocus={(e) => e.target.select()} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
        {suffix && <span className="shrink-0 text-sm text-muted">{suffix}</span>}
      </div>
    </label>
  )
}

export default function Simulator({ rows, settings }: { rows: Row[]; settings: Settings }) {
  const [help, setHelp] = useState(false)
  const [pro, setPro] = useState(() => { try { return localStorage.getItem('tj-sim-mode') === 'pro' } catch { return false } })
  const choose = (v: boolean) => { setPro(v); try { localStorage.setItem('tj-sim-mode', v ? 'pro' : 'simple') } catch { /* ignore */ } }
  const modeSwitch = (
    <div className="seg" role="group" aria-label="Simulator mode">
      <button type="button" aria-pressed={!pro} onClick={() => choose(false)}>Simple</button>
      <button type="button" aria-pressed={pro} onClick={() => choose(true)}>Pro</button>
    </div>
  )
  if (pro) return (
    <div className="space-y-5">
      <PageTitle title="Simulator" sub="Test a style of trading across thousands of possible futures.">
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost" onClick={() => setHelp(true)}><span aria-hidden="true">?</span> How to use</button>
          {modeSwitch}
        </div>
      </PageTitle>
      <SimulatorPro rows={rows} settings={settings} />
      {help && <SimulatorHelp onClose={() => setHelp(false)} />}
    </div>
  )
  return <SimpleSimulator rows={rows} settings={settings} modeSwitch={modeSwitch} />
}

function SimpleSimulator({ rows, settings, modeSwitch }: { rows: Row[]; settings: Settings; modeSwitch: React.ReactNode }) {
  const [inp, setInp] = useState<SimInput>(() => (typeof localStorage === 'undefined' ? SIMPLE : load()))
  const [seed, setSeed] = useState(1)
  const set = (patch: Partial<SimInput>) => setInp((p) => ({ ...p, ...patch }))
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(inp)) } catch { /* ignore */ } }, [inp])

  const input = useMemo(() => clampInput({ ...inp, capital: Math.max(inp.capital, inp.risk * 200) }), [inp])
  const result = useMemo(() => simulate(input), [input])
  const example = useMemo(() => exampleRun(input, seed), [input, seed])
  const adv = advice(input, input.risk)
  const perTrade = expectancyMoney(input, input.risk)
  const expected = perTrade * input.trades
  const chance = Math.round(result.summary.profitablePct)
  const good = adv.profitable

  const useJournal = () => {
    const st = summarize(rows)
    if (st.count === 0) return
    setInp((p) => ({
      ...p, winRate: Math.round(st.winRate), rr: st.avgLoss > 0 ? Math.round((st.avgWin / st.avgLoss) * 10) / 10 : p.rr,
      risk: Math.max(1, Math.round(st.avgLoss)), charges: Math.round((st.charges / st.count) * 10) / 10, capital: settings.startingCapital || p.capital,
    }))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle title="Simulator" sub="Pretend to take a lot of trades, and see if your style would make money.">{modeSwitch}</PageTitle>

      {/* 1. Four questions */}
      <div className="card space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold">Your trading style</h2>
          <button type="button" className="text-xs font-semibold text-accent hover:underline disabled:opacity-40" disabled={rows.length === 0} onClick={useJournal}>Use my real trades</button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="How many trades win?" hint="out of 100" value={inp.winRate} suffix="%" min={0} onChange={(n) => set({ winRate: Math.min(100, n) })} />
          <Field label="When you win, you make" hint="times what you lose" value={inp.rr} suffix="×" step={0.1} onChange={(n) => set({ rr: n })} />
          <Field label="You risk on each trade" value={inp.risk} prefix="₹" step={100} onChange={(n) => set({ risk: n })} />
          <Field label="Number of trades" value={inp.trades} onChange={(n) => set({ trades: n })} />
          <Field label="Charges on each trade" hint="brokerage, taxes, fees" value={inp.charges} prefix="₹" step={5} onChange={(n) => set({ charges: n })} />
        </div>
        {inp.charges > 0 && <p className="text-xs text-muted">Charges are taken off every trade, win or lose. That is {inr(Math.round(inp.charges * inp.trades))} over {inp.trades} trades.</p>}
      </div>

      {/* 2. The answer */}
      <div className={`rounded-2xl border px-6 py-6 text-center ${good ? 'border-up/40 bg-up/10' : 'border-down/40 bg-down/10'}`} role="status">
        <div className="text-sm text-muted">After {input.trades} trades like this, you would usually</div>
        <div className={`num mt-1 font-display text-5xl font-extrabold tracking-tight ${good ? 'text-up' : 'text-down'}`}>{good ? 'make' : 'lose'} {inr(Math.abs(Math.round(expected)))}</div>
        <div className="mt-3 text-base">
          In <b className="num">{chance} out of 100</b> tries, you end up in profit.
        </div>
        <div className="mx-auto mt-3 h-2.5 max-w-sm overflow-hidden rounded-full bg-down/40">
          <div className="h-full rounded-full bg-up transition-all duration-700" style={{ width: `${chance}%` }} />
        </div>
      </div>

      {/* 3. One example, trade by trade */}
      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold">One example</h2>
          <button type="button" className="btn-ghost !py-1.5 text-sm" onClick={() => setSeed((s) => s + 1)}>↻ Show another</button>
        </div>
        <div className="flex flex-wrap gap-1" role="img" aria-label={`${example.wins} winning and ${example.trades.length - example.wins} losing trades`}>
          {example.trades.map((t, i) => (
            <span key={`${seed}-${i}`} title={`Trade ${i + 1}: ${money(t.amount)}`} className={`rise h-4 w-4 rounded-[4px] ${t.win ? 'bg-up' : 'bg-down'}`} style={{ animationDelay: `${Math.min(i, 120) * 6}ms` }} />
          ))}
        </div>
        <p className="mt-3 text-sm">
          <span className="font-semibold text-up">{example.wins} wins</span> and <span className="font-semibold text-down">{example.trades.length - example.wins} losses</span>, ending with <b className={`num ${example.total >= 0 ? 'text-up' : 'text-down'}`}>{money(example.total)}</b>.
          {example.longestLosses >= 3 && <> At one point you lose <b>{example.longestLosses} in a row</b>. That is normal.</>}
        </p>
      </div>

      {/* 4. What to change */}
      <div className="card">
        <h2 className="font-display text-base font-bold">{good ? 'Why this works' : 'What would make it profitable'}</h2>
        <p className="mt-2 text-sm leading-relaxed">
          {good ? (
            <>Winning {inp.winRate} in 100 trades, with wins <b>{inp.rr}×</b> your losses, earns about <b className="num text-up">{inr(Math.round(perTrade))}</b> on every trade, on average. You only need to win <b className="num">{Math.min(100, adv.needWinRate).toFixed(0)}</b> in 100 at this size of win.</>
          ) : (
            <>With wins <b>{inp.rr}×</b> your losses, you need to win at least <b className="num">{Math.min(100, adv.needWinRate).toFixed(0)}</b> in 100 trades. You win {inp.winRate}.<br />
              Or, if you keep winning {inp.winRate} in 100, make your wins at least <b className="num">{Number.isFinite(adv.needRR) ? adv.needRR.toFixed(1) : '∞'}×</b> your losses. They are {inp.rr}× now.</>
          )}
        </p>
        <p className="mt-3 text-xs text-muted">This is a what-if, not a promise. It assumes every trade is separate and your numbers never change.</p>
      </div>
    </div>
  )
}
