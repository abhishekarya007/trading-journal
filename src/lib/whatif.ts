import type { ChargeRates } from './types'
import { calcTrade } from './calc'
import { summarize, type Row, type Summary } from './stats'
import { chronological } from './insights'

export type RuleKey =
  | 'skipSetup' | 'skipFlawed' | 'skipFirstMinutes' | 'noEntriesAfter'
  | 'maxTradesPerDay' | 'stopAfterLosses' | 'dailyLossLimit' | 'capLossR'

export interface RuleSet {
  maxTradesPerDay?: number // keep only the first N trades of each day
  stopAfterLosses?: number // stop for the day after N losing trades
  dailyLossLimit?: number // stop for the day once it is down this many rupees
  skipFirstMinutes?: number // no entries in the first N minutes after the 9:15 open
  noEntriesAfter?: string // HH:MM, no entries from this time on
  capLossR?: number // exit at X times your risk (entry to stop-loss) instead of letting a loss run further
  skipFlawed?: boolean // skip trades that broke the plan or had an entry/behaviour mistake
  skipSetup?: string // skip every trade of this setup
}

export const RULE_LABEL: Record<RuleKey, string> = {
  skipSetup: 'Skip a setup',
  skipFlawed: 'Skip plan-breaking / mistaken trades',
  skipFirstMinutes: 'No entries just after the open',
  noEntriesAfter: 'No entries after a set time',
  maxTradesPerDay: 'Maximum trades per day',
  stopAfterLosses: 'Stop for the day after losses',
  dailyLossLimit: 'Daily loss limit',
  capLossR: 'Cap every loss',
}

const OPEN = 9 * 60 + 15
const mins = (t?: string) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m
}

export interface SimOptions { rates: ChargeRates; exitTags: string[] }

export interface SimResult {
  kept: Row[] // trades that would still be taken, with any capped-loss result applied
  removed: { row: Row; rule: RuleKey }[] // trades that would have been skipped, with their ACTUAL result
  capped: number // trades whose loss was cut short
  actual: Summary
  summary: Summary
  delta: number // what-if net minus actual net
  removedNet: number
  removedWins: number
  removedLosses: number
  byRule: Partial<Record<RuleKey, number>> // trades removed by each rule
}

/**
 * Replays your past trades under a set of rules. Filters on the trade itself run first, then losses are capped,
 * then the rules that depend on how the day has gone so far (trade count, losses, daily loss) run in time order.
 */
export function simulate(rows: Row[], rules: RuleSet, opts: SimOptions): SimResult {
  const removed: SimResult['removed'] = []
  const drop = (row: Row, rule: RuleKey) => removed.push({ row, rule })
  const own = (r: Row) => r.trade.mistakes.filter((m) => !opts.exitTags.includes(m))
  const after = rules.noEntriesAfter ? mins(rules.noEntriesAfter) : null

  const survivors: Row[] = []
  for (const r of chronological(rows)) {
    const t = r.trade
    const m = mins(t.entryTime)
    if (rules.skipSetup && t.setup === rules.skipSetup) { drop(r, 'skipSetup'); continue }
    if (rules.skipFlawed && (!t.followedPlan || own(r).length > 0)) { drop(r, 'skipFlawed'); continue }
    if (rules.skipFirstMinutes && rules.skipFirstMinutes > 0 && m !== null && m < OPEN + rules.skipFirstMinutes) { drop(r, 'skipFirstMinutes'); continue }
    if (after !== null && m !== null && m >= after) { drop(r, 'noEntriesAfter'); continue }
    survivors.push(r)
  }

  let capped = 0
  const pairs = survivors.map((orig) => {
    const t = orig.trade
    if (!rules.capLossR || rules.capLossR <= 0 || !t.stopLoss) return { orig, sim: orig }
    const risk = Math.abs(t.entryPrice - t.stopLoss)
    if (risk <= 0) return { orig, sim: orig }
    const dir = t.side === 'Long' ? 1 : -1
    const moveR = (dir * (t.exitPrice - t.entryPrice)) / risk
    if (moveR >= -rules.capLossR - 1e-9) return { orig, sim: orig }
    const trade = { ...t, exitPrice: t.entryPrice - dir * rules.capLossR * risk }
    capped++
    return { orig, sim: { trade, res: calcTrade(trade, opts.rates) } as Row }
  })

  const day = new Map<string, { count: number; losses: number; net: number }>()
  const kept: Row[] = []
  for (const { orig, sim } of pairs) {
    const s = day.get(orig.trade.date) ?? { count: 0, losses: 0, net: 0 }
    day.set(orig.trade.date, s)
    if (rules.maxTradesPerDay && s.count >= rules.maxTradesPerDay) { drop(orig, 'maxTradesPerDay'); continue }
    if (rules.stopAfterLosses && s.losses >= rules.stopAfterLosses) { drop(orig, 'stopAfterLosses'); continue }
    if (rules.dailyLossLimit && rules.dailyLossLimit > 0 && s.net <= -rules.dailyLossLimit) { drop(orig, 'dailyLossLimit'); continue }
    s.count += 1
    if (sim.res.net < 0) s.losses += 1
    s.net += sim.res.net
    kept.push(sim)
  }

  const actual = summarize(rows)
  const summary = summarize(kept)
  const byRule: SimResult['byRule'] = {}
  for (const x of removed) byRule[x.rule] = (byRule[x.rule] ?? 0) + 1
  return {
    kept, removed, capped, actual, summary,
    delta: summary.net - actual.net,
    removedNet: removed.reduce((s, x) => s + x.row.res.net, 0),
    removedWins: removed.filter((x) => x.row.res.net > 0).length,
    removedLosses: removed.filter((x) => x.row.res.net < 0).length,
    byRule,
  }
}

/** What each switched-on rule would have done by itself, so you can see which one is worth adopting. */
export function eachRuleAlone(rows: Row[], rules: RuleSet, opts: SimOptions) {
  const pick: [RuleKey, RuleSet][] = [
    ['skipSetup', { skipSetup: rules.skipSetup }], ['skipFlawed', { skipFlawed: rules.skipFlawed }],
    ['skipFirstMinutes', { skipFirstMinutes: rules.skipFirstMinutes }], ['noEntriesAfter', { noEntriesAfter: rules.noEntriesAfter }],
    ['maxTradesPerDay', { maxTradesPerDay: rules.maxTradesPerDay }], ['stopAfterLosses', { stopAfterLosses: rules.stopAfterLosses }],
    ['dailyLossLimit', { dailyLossLimit: rules.dailyLossLimit }], ['capLossR', { capLossR: rules.capLossR }],
  ]
  return pick
    .filter(([k]) => !!rules[k])
    .map(([rule, only]) => {
      const r = simulate(rows, only, opts)
      return { rule, delta: r.delta, removed: r.removed.length, capped: r.capped }
    })
}
