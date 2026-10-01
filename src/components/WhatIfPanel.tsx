import { useMemo, useState } from 'react'
import type { Settings } from '../lib/types'
import type { Row } from '../lib/stats'
import { eachRuleAlone, RULE_LABEL, simulate, type RuleKey, type RuleSet } from '../lib/whatif'
import { inr, pct } from '../lib/format'
import { Card } from './InsightBits'

interface Def { key: RuleKey; desc: string; input: 'num' | 'time' | 'setup' | 'none'; prefix?: string; suffix?: string; min?: number; step?: number }
const DEFS: Def[] = [
  { key: 'maxTradesPerDay', desc: 'Only take the first few trades of each day.', input: 'num', prefix: 'at most', suffix: 'trades a day', min: 1, step: 1 },
  { key: 'stopAfterLosses', desc: 'Done for the day once you have had this many losing trades.', input: 'num', prefix: 'after', suffix: 'losing trades', min: 1, step: 1 },
  { key: 'dailyLossLimit', desc: 'Done for the day once the day is down this much.', input: 'num', prefix: '₹', suffix: 'lost in a day', min: 1, step: 100 },
  { key: 'capLossR', desc: 'If a trade goes against you, you exit at this many times the risk you planned (entry to stop-loss). Needs a stop-loss on the trade.', input: 'num', prefix: 'cut at', suffix: '× risk', min: 0.1, step: 0.1 },
  { key: 'skipFirstMinutes', desc: 'Let the opening noise pass. Needs entry times.', input: 'num', prefix: 'wait', suffix: 'min after 9:15', min: 1, step: 5 },
  { key: 'noEntriesAfter', desc: 'No new trades late in the session. Needs entry times.', input: 'time', prefix: 'none from' },
  { key: 'skipFlawed', desc: 'Skip anything where you broke your plan or tagged an entry or behaviour mistake.', input: 'none' },
  { key: 'skipSetup', desc: 'Drop a setup completely.', input: 'setup', prefix: 'skip' },
]

type Vals = { maxTradesPerDay: number; stopAfterLosses: number; dailyLossLimit: number; capLossR: number; skipFirstMinutes: number; noEntriesAfter: string; skipSetup: string }

const sgn = (n: number) => (n > 0 ? '+' : '') + inr(n)
const tone = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted')
const pf = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '∞')

function Bar({ label, value, max, strong }: { label: string; value: number; max: number; strong?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className={strong ? 'font-semibold' : 'text-muted'}>{label}</span>
        <span className={`num font-semibold ${tone(value)}`}>{sgn(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-panel2">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${max ? Math.max(3, (Math.abs(value) / max) * 100) : 0}%`, background: value >= 0 ? 'linear-gradient(90deg, var(--up), var(--accent))' : 'linear-gradient(90deg, var(--down), var(--warn))' }} />
      </div>
    </div>
  )
}

export default function WhatIfPanel({ rows, settings }: { rows: Row[]; settings: Settings }) {
  const [on, setOn] = useState<Record<RuleKey, boolean>>({ maxTradesPerDay: false, stopAfterLosses: false, dailyLossLimit: false, capLossR: false, skipFirstMinutes: false, noEntriesAfter: false, skipFlawed: false, skipSetup: false })
  const [v, setV] = useState<Vals>({ maxTradesPerDay: 3, stopAfterLosses: 2, dailyLossLimit: settings.risk.dailyLossLimit || 1000, capLossR: 1, skipFirstMinutes: 15, noEntriesAfter: '14:30', skipSetup: settings.setups[0] ?? '' })

  const rules: RuleSet = useMemo(() => {
    const r: RuleSet = {}
    if (on.maxTradesPerDay && v.maxTradesPerDay > 0) r.maxTradesPerDay = v.maxTradesPerDay
    if (on.stopAfterLosses && v.stopAfterLosses > 0) r.stopAfterLosses = v.stopAfterLosses
    if (on.dailyLossLimit && v.dailyLossLimit > 0) r.dailyLossLimit = v.dailyLossLimit
    if (on.capLossR && v.capLossR > 0) r.capLossR = v.capLossR
    if (on.skipFirstMinutes && v.skipFirstMinutes > 0) r.skipFirstMinutes = v.skipFirstMinutes
    if (on.noEntriesAfter && v.noEntriesAfter) r.noEntriesAfter = v.noEntriesAfter
    if (on.skipFlawed) r.skipFlawed = true
    if (on.skipSetup && v.skipSetup) r.skipSetup = v.skipSetup
    return r
  }, [on, v])
  const active = Object.keys(rules).length
  const opts = useMemo(() => ({ rates: settings.rates, exitTags: settings.exitMistakes }), [settings.rates, settings.exitMistakes])
  const sim = useMemo(() => simulate(rows, rules, opts), [rows, rules, opts])
  const alone = useMemo(() => (active > 1 ? eachRuleAlone(rows, rules, opts) : []), [rows, rules, opts, active])
  const untimed = rows.filter((r) => !r.trade.entryTime).length
  const needsTime = !!(rules.skipFirstMinutes || rules.noEntriesAfter)
  const noStop = rows.filter((r) => !r.trade.stopLoss).length

  const a = sim.actual
  const s = sim.summary
  const barMax = Math.max(Math.abs(a.net), Math.abs(s.net), 1)
  const relative = a.net !== 0 ? (sim.delta / Math.abs(a.net)) * 100 : null

  return (
    <div className="grid items-start gap-5 lg:grid-cols-5">
      {/* Rules */}
      <div className="space-y-3 lg:col-span-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">Switch on rules and see what your past trades would have made.</p>
          {active > 0 && <button className="text-xs text-accent hover:underline" onClick={() => setOn(Object.fromEntries(Object.keys(on).map((k) => [k, false])) as Record<RuleKey, boolean>)}>Turn all off</button>}
        </div>
        {DEFS.map((d) => {
          const enabled = on[d.key]
          return (
            <div key={d.key} className={`card !p-4 transition ${enabled ? '!border-accent/50' : ''}`}>
              <div className="flex items-start gap-3">
                <button type="button" role="switch" aria-checked={enabled} aria-label={`Turn on: ${RULE_LABEL[d.key]}`} onClick={() => setOn((p) => ({ ...p, [d.key]: !p[d.key] }))}
                  className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition ${enabled ? 'border-accent bg-accent/40' : 'border-line bg-panel2'}`}>
                  <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-fg transition-all ${enabled ? 'left-[1.35rem]' : 'left-0.5'}`} style={{ height: 18, width: 18 }} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{RULE_LABEL[d.key]}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{d.desc}</p>
                  {d.input !== 'none' && (
                    <div className={`mt-2.5 flex flex-wrap items-center gap-2 text-sm transition ${enabled ? '' : 'pointer-events-none opacity-50'}`}>
                      {d.prefix && <span className="text-muted">{d.prefix}</span>}
                      {d.input === 'num' && (
                        <input type="number" className="input num !w-24 !py-1.5" min={d.min} step={d.step} aria-label={RULE_LABEL[d.key]}
                          value={v[d.key as 'maxTradesPerDay']} onChange={(e) => setV((p) => ({ ...p, [d.key]: Number(e.target.value) }))} />
                      )}
                      {d.input === 'time' && <input type="time" className="input num !w-32 !py-1.5" value={v.noEntriesAfter} onChange={(e) => setV((p) => ({ ...p, noEntriesAfter: e.target.value }))} aria-label="Time" />}
                      {d.input === 'setup' && (
                        <select className="input !w-44 !py-1.5" value={v.skipSetup} onChange={(e) => setV((p) => ({ ...p, skipSetup: e.target.value }))} aria-label="Setup to skip">
                          {settings.setups.map((x) => <option key={x}>{x}</option>)}
                        </select>
                      )}
                      {d.suffix && <span className="text-muted">{d.suffix}</span>}
                    </div>
                  )}
                </div>
                {enabled && (d.key in sim.byRule || (d.key === 'capLossR' && sim.capped > 0)) && (
                  <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent">
                    {d.key === 'capLossR' ? `${sim.capped} cut` : `${sim.byRule[d.key]} skipped`}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Result */}
      <div className="order-first space-y-4 lg:order-none lg:col-span-2 lg:sticky lg:top-20">
        <Card title="What would have happened">
          {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted">No trades in this period.</p>
            : active === 0 ? <p className="py-6 text-center text-sm text-muted">Switch on a rule on the left to see the difference it would have made across your {rows.length} trades.</p> : (
              <div className="space-y-4">
                <div>
                  <div className={`num text-3xl font-semibold tracking-tight ${tone(sim.delta)}`}>{sim.delta === 0 ? 'No change' : `${sim.delta > 0 ? '+' : '-'}${inr(Math.abs(sim.delta))}`}</div>
                  <p className="mt-1 text-sm text-muted">
                    {sim.delta > 0 ? 'You would have made more' : sim.delta < 0 ? 'You would have made less' : 'Same result'}
                    {relative !== null && sim.delta !== 0 && <> ({relative > 0 ? '+' : ''}{relative.toFixed(0)}% against your actual {sgn(a.net)})</>}.
                  </p>
                </div>
                <div className="space-y-3">
                  <Bar label="What you actually made" value={a.net} max={barMax} />
                  <Bar label="With these rules" value={s.net} max={barMax} strong />
                </div>
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-muted"><tr><th className="py-1.5 text-left font-medium" /><th className="py-1.5 text-right font-medium">Actual</th><th className="py-1.5 text-right font-medium">With rules</th></tr></thead>
                  <tbody>
                    {([
                      ['Trades', String(a.count), String(s.count)],
                      ['Win rate', pct(a.winRate), pct(s.winRate)],
                      ['Profit factor', pf(a.profitFactor), pf(s.profitFactor)],
                      ['Per trade', sgn(a.expectancy), sgn(s.expectancy)],
                      ['Max drawdown', inr(a.maxDrawdown), inr(s.maxDrawdown)],
                    ] as const).map(([k, x, y]) => (
                      <tr key={k} className="border-t border-line"><td className="py-1.5 text-muted">{k}</td><td className="num py-1.5 text-right">{x}</td><td className="num py-1.5 text-right font-semibold">{y}</td></tr>
                    ))}
                  </tbody>
                </table>
                {(sim.removed.length > 0 || sim.capped > 0) && (
                  <p className="text-xs leading-relaxed text-muted">
                    {sim.removed.length > 0 && <>Skipped <b className="num text-fg">{sim.removed.length}</b> of {a.count} trades ({sim.removedWins} winners, {sim.removedLosses} losers) that together made <b className={`num ${tone(sim.removedNet)}`}>{sgn(sim.removedNet)}</b>. </>}
                    {sim.capped > 0 && <>{sim.capped} losing trade{sim.capped === 1 ? ' was' : 's were'} cut short.</>}
                  </p>
                )}
                {alone.length > 0 && (
                  <div>
                    <div className="label">Each rule on its own</div>
                    <ul className="space-y-1 text-sm">
                      {alone.map((x) => (
                        <li key={x.rule} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate">{RULE_LABEL[x.rule]}</span>
                          <span className="num shrink-0 font-semibold"><span className={tone(x.delta)}>{x.delta === 0 ? '±0' : `${x.delta > 0 ? '+' : '-'}${inr(Math.abs(x.delta))}`}</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {needsTime && untimed > 0 && <p className="text-[11px] text-warn">{untimed} trades have no entry time, so time rules never remove them.</p>}
                {rules.capLossR && noStop > 0 && <p className="text-[11px] text-warn">{noStop} trades have no stop-loss, so loss capping can’t apply to them.</p>}
              </div>
            )}
        </Card>
        <p className="px-1 text-[11px] leading-relaxed text-muted">
          This replays only the trades you actually took. Skipping a trade can’t change what the market did, but trading less, or differently, might have led to different trades, so treat this as a guide, not a promise. Small samples can mislead.
        </p>
      </div>
    </div>
  )
}
