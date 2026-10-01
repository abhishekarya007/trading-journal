import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Settings } from '../lib/types'
import type { Row } from '../lib/stats'
import { checkAll, describeRule, rulebookStats, STARTER_RULES, weeklyAdherence, type Rule } from '../lib/rulebook'
import { addDays, localDate, weekStart } from '../lib/week'
import { inr, pct, pnlColor, time12 } from '../lib/format'
import { toast } from '../lib/toast'
import PageTitle from '../components/PageTitle'
import RuleModal from '../components/RuleModal'
import { IconEdit, IconPlus, IconRulebook, IconTrash } from '../components/Icons'

type Period = 'all' | 'month' | 'week'
const PERIODS: { id: Period; label: string }[] = [{ id: 'all', label: 'All time' }, { id: 'month', label: 'This month' }, { id: 'week', label: 'This week' }]
const tone = (p: number | null) => (p === null ? 'bg-line' : p >= 90 ? 'bg-up' : p >= 70 ? 'bg-warn' : 'bg-down')

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-accent' : 'bg-line'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[1.15rem]' : 'left-0.5'}`} />
    </button>
  )
}

export default function Rulebook({ rows, settings, save }: { rows: Row[]; settings: Settings; save: (s: Settings) => void }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('all')
  const [editing, setEditing] = useState<Rule | null>(null)
  const [adding, setAdding] = useState(false)
  const rules = settings.rulebook.rules
  const setRules = (next: Rule[]) => save({ ...settings, rulebook: { rules: next } })

  // Every trade is checked with the whole history (day rules need the day), then the numbers are taken for the chosen period.
  const checks = useMemo(() => checkAll(rows, settings), [rows, settings])
  const today = localDate()
  const inPeriod = useMemo(() => rows.filter((r) => period === 'all' || (period === 'month' ? r.trade.date.startsWith(today.slice(0, 7)) : r.trade.date >= weekStart(today) && r.trade.date <= addDays(weekStart(today), 6))), [rows, period, today])
  const stats = useMemo(() => rulebookStats(inPeriod, checks, settings), [inPeriod, checks, settings])
  const trend = useMemo(() => weeklyAdherence(rows, checks), [rows, checks])
  const broken = useMemo(() => [...inPeriod].filter((r) => (checks.get(r.trade)?.failed ?? 0) > 0).sort((a, b) => b.trade.date.localeCompare(a.trade.date) || (b.trade.id ?? 0) - (a.trade.id ?? 0)).slice(0, 8), [inPeriod, checks])
  const costliest = [...stats.perRule].filter((s) => s.failed > 0 && s.failedNet < 0).sort((a, b) => a.failedNet - b.failedNet)[0]
  const statOf = (id: string) => stats.perRule.find((s) => s.rule.id === id)

  const update = (r: Rule) => setRules(rules.map((x) => (x.id === r.id ? r : x)))
  const remove = (r: Rule) => {
    const before = rules
    setRules(rules.filter((x) => x.id !== r.id))
    toast('Rule removed', 'info', { action: { label: 'Undo', run: () => { setRules(before); toast('Rule restored', 'info') } } })
  }

  if (rules.length === 0)
    return (
      <div>
        <PageTitle title="Rulebook" sub="Your trading rules, checked against every trade automatically" />
        <div className="card mx-auto max-w-xl py-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent"><IconRulebook /></div>
          <h2 className="font-display text-lg font-semibold">Write down your rules once</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">Things like “always set a stop-loss”, “no more than 5 trades a day” or “no entries before 9:30”. The app then checks every trade against them from the details you already log, and scores how well you stick to them. No ticking boxes.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button className="btn" onClick={() => { setRules(STARTER_RULES()); toast('Starter rules added', 'success') }}>Add 5 starter rules</button>
            <button className="btn-ghost" onClick={() => setAdding(true)}><IconPlus /> Choose my own</button>
          </div>
        </div>
        {adding && <RuleModal settings={settings} onClose={() => setAdding(false)} onSave={(r) => { setRules([r]); setAdding(false) }} />}
      </div>
    )

  return (
    <div className="space-y-5">
      <PageTitle title="Rulebook" sub="Your trading rules, checked against every trade automatically">
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Period">
            {PERIODS.map((p) => <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
          </div>
          <button className="btn" onClick={() => setAdding(true)}><IconPlus /> Add rule</button>
        </div>
      </PageTitle>

      {/* The score */}
      <div className="card !p-0">
        <div className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-line">
          <div className="p-5">
            <div className="label">Rules followed</div>
            <div className={`num text-3xl font-semibold ${stats.adherence === null ? 'text-muted' : stats.adherence >= 90 ? 'text-up' : stats.adherence >= 70 ? 'text-warn' : 'text-down'}`}>{stats.adherence === null ? '–' : pct(stats.adherence)}</div>
            <div className="mt-1 text-xs text-muted">of all rule checks passed</div>
          </div>
          <div className="p-5">
            <div className="label">Clean trades</div>
            <div className="num text-3xl font-semibold">{stats.cleanPct === null ? '–' : pct(stats.cleanPct)}</div>
            <div className="mt-1 text-xs text-muted">{stats.cleanTrades} of {stats.trades} broke no rule</div>
          </div>
          <div className="border-t border-line p-5 md:border-t-0">
            <div className="label">Clean streak</div>
            <div className="num text-3xl font-semibold">{stats.cleanStreak}</div>
            <div className="mt-1 text-xs text-muted">{stats.cleanStreak === 1 ? 'trade' : 'trades'} in a row, latest first</div>
          </div>
          <div className="border-t border-line p-5 md:border-t-0">
            <div className="label">Last {trend.length || 8} weeks</div>
            {trend.length === 0 ? <div className="text-sm text-muted">No trades yet</div> : (
              <div className="flex h-12 items-end gap-1.5" role="img" aria-label="Rule adherence by week">
                {trend.map((w) => (
                  <div key={w.weekStart} title={`Week of ${w.weekStart}: ${pct(w.adherence)} followed (${w.trades} trades)`}
                    className={`flex-1 rounded-t ${tone(w.adherence)}`} style={{ height: `${Math.max(8, w.adherence)}%` }} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {costliest && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <b>Your costliest rule to break:</b> “{describeRule(costliest.rule)}”. The {costliest.failed} {costliest.failed === 1 ? 'trade' : 'trades'} that broke it lost <b className="num text-down">{inr(-costliest.failedNet)}</b> in total.
        </div>
      )}

      {/* The rules */}
      <div className="card !p-0">
        <div className="relative overflow-x-auto">{/* relative: keeps the hidden screen-reader labels inside the scrolling box */}
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted">
              <tr className="border-b border-line">
                <th className="w-px py-3 pl-5 pr-2"><span className="sr-only">On</span></th>
                <th className="px-3 py-3 text-left font-medium">Rule</th>
                <th className="px-3 py-3 text-left font-medium">Followed</th>
                <th className="px-3 py-3 text-right font-medium">Broken</th>
                <th className="px-3 py-3 text-right font-medium">P&amp;L when broken</th>
                <th className="px-3 py-3 text-right font-medium">P&amp;L when followed</th>
                <th className="w-px py-3 pl-2 pr-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const s = statOf(rule.id)
                return (
                  <tr key={rule.id} className={`border-b border-line/70 last:border-0 ${rule.enabled ? '' : 'opacity-50'}`}>
                    <td className="py-3.5 pl-5 pr-2"><Switch on={rule.enabled} label={`${rule.enabled ? 'Turn off' : 'Turn on'}: ${describeRule(rule)}`} onChange={(v) => update({ ...rule, enabled: v })} /></td>
                    <td className="px-3 py-3.5 font-medium">{describeRule(rule)}{!rule.enabled && <span className="ml-2 text-xs font-normal text-muted">off</span>}</td>
                    <td className="px-3 py-3.5">
                      {!rule.enabled ? <span className="text-muted">–</span> : s && s.followedPct !== null ? (
                        <div className="flex items-center gap-2.5">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${tone(s.followedPct)}`} style={{ width: `${s.followedPct}%` }} /></div>
                          <span className="num text-xs font-medium">{pct(s.followedPct)}</span>
                        </div>
                      ) : <span className="text-xs text-muted" title="No trade in this period has the details this rule needs (for example a stop-loss or a time).">not enough data</span>}
                    </td>
                    <td className="num px-3 py-3.5 text-right">{rule.enabled && s && s.judged ? s.failed : '–'}</td>
                    <td className={`num px-3 py-3.5 text-right ${s && s.failed ? pnlColor(s.failedNet) : 'text-muted'}`}>{rule.enabled && s && s.failed ? inr(s.failedNet) : '–'}</td>
                    <td className={`num px-3 py-3.5 text-right ${s && s.passed ? pnlColor(s.passedNet) : 'text-muted'}`}>{rule.enabled && s && s.passed ? inr(s.passedNet) : '–'}</td>
                    <td className="whitespace-nowrap py-2 pl-2 pr-4 text-right">
                      <button type="button" className="rowbtn" title="Change" aria-label={`Change rule: ${describeRule(rule)}`} onClick={() => setEditing(rule)}><IconEdit /></button>
                      <button type="button" className="rowbtn rowbtn-danger" title="Remove" aria-label={`Remove rule: ${describeRule(rule)}`} onClick={() => remove(rule)}><IconTrash /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">A rule that needs something a trade doesn’t have (a stop-loss, a time) skips that trade instead of failing it. “P&amp;L when broken” is the total of the trades that broke the rule.</p>
      </div>

      {/* Recent breaks */}
      <div className="card">
        <h3 className="mb-3 text-sm font-semibold">Recent trades that broke a rule</h3>
        {broken.length === 0 ? <p className="py-4 text-center text-sm text-muted">{stats.trades === 0 ? 'No trades to check in this period yet.' : 'Nothing broken in this period. Nice work.'}</p> : (
          <ul className="divide-y divide-line/70">
            {broken.map((r) => {
              const c = checks.get(r.trade)!
              return (
                <li key={r.trade.id}>
                  <button type="button" onClick={() => navigate('/trades', { state: { open: r.trade.id } })} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-1 py-3 text-left transition hover:bg-panel2/60">
                    <span className="w-64 shrink-0 text-sm"><b>{r.trade.symbol}</b> <span className="text-xs text-muted">{r.trade.date}{r.trade.entryTime ? ` · ${time12(r.trade.entryTime)}` : ''}</span></span>
                    <span className={`num w-24 shrink-0 text-sm font-semibold ${pnlColor(r.res.net)}`}>{inr(r.res.net)}</span>
                    <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {c.results.filter((x) => x.outcome === 'fail').map((x) => <span key={x.rule.id} className="rounded-md bg-down/10 px-2 py-0.5 text-[11px] font-medium text-down">{describeRule(x.rule)}</span>)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {adding && <RuleModal settings={settings} onClose={() => setAdding(false)} onSave={(r) => { setRules([...rules, r]); setAdding(false); toast('Rule added', 'success') }} />}
      {editing && <RuleModal settings={settings} rule={editing} onClose={() => setEditing(null)} onSave={(r) => { update(r); setEditing(null); toast('Rule saved', 'success') }} />}
    </div>
  )
}
