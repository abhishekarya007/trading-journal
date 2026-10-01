import type { Settings } from './types'
import { evaluateDay, type RiskWarning } from './risk'
import type { Row } from './stats'
import { monthlyCapital } from './capital'
import { goalStatus, monthLimitWarnings } from './goals'

export interface AutoCheck { id: 'limits' | 'cooldown'; label: string; ok: boolean; detail: string }

/** Everything that would warn you about trading right now: your risk rules and the month's loss limit. */
export function checklistWarnings(rows: Row[], settings: Settings, date: string): RiskWarning[] {
  const month = date.slice(0, 7)
  const cap = monthlyCapital(rows, settings, month).get(month)
  const net = rows.filter((r) => r.trade.date.startsWith(month)).reduce((s, r) => s + r.res.net, 0)
  return [
    ...evaluateDay(rows, date, settings.risk),
    ...monthLimitWarnings(goalStatus(net, cap?.goal ?? 0, cap?.maxLoss ?? 0, month, date)),
  ]
}

/** What the app can already tell you: are today's limits fine, is a cooldown running. */
export function autoChecks(warnings: RiskWarning[], cooldownActive: boolean): AutoCheck[] {
  return [
    { id: 'limits', label: 'Inside today’s limits', ok: warnings.length === 0, detail: warnings.length ? warnings.map((w) => w.message).join(' ') : 'no limit reached' },
    { id: 'cooldown', label: 'No cooldown running', ok: !cooldownActive, detail: cooldownActive ? 'you are on a break' : 'clear' },
  ]
}
