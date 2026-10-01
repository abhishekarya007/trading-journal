import type { Settings, Trade } from './types'
import type { Row } from './stats'
import type { RiskWarning } from './risk'
import { calcTrade } from './calc'
import { checklistWarnings } from './checklist'
import { monthlyCapital } from './capital'

export interface SavedOutcome {
  result: 'win' | 'loss' | 'flat'
  net: number // this trade, after charges
  dayNet: number // that day including this trade
  newWarnings: RiskWarning[] // risk limits this trade just crossed (not ones already crossed)
  goalReached: boolean // this trade took the month past its profit goal
}

/** What a newly saved trade did: its result, the day's total, any limit it crossed, and whether it reached the monthly goal. */
export function savedOutcome(before: Row[], trade: Trade, settings: Settings): SavedOutcome {
  const res = calcTrade(trade, settings.rates)
  const after = [...before, { trade, res }]
  const month = trade.date.slice(0, 7)
  const sum = (rows: Row[], pick: (r: Row) => boolean) => rows.filter(pick).reduce((s, r) => s + r.res.net, 0)
  const goal = monthlyCapital(after, settings, month).get(month)?.goal ?? 0
  const monthBefore = sum(before, (r) => r.trade.date.startsWith(month))
  const monthAfter = monthBefore + res.net
  const had = checklistWarnings(before, settings, trade.date)
  return {
    result: Math.abs(res.net) < 1 ? 'flat' : res.net > 0 ? 'win' : 'loss',
    net: res.net,
    dayNet: sum(after, (r) => r.trade.date === trade.date),
    newWarnings: checklistWarnings(after, settings, trade.date).filter((w) => !had.some((h) => h.rule === w.rule)),
    goalReached: goal > 0 && monthBefore < goal && monthAfter >= goal,
  }
}
