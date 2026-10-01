import type { RiskRules } from './types'
import type { Row } from './stats'

export interface RiskWarning {
  rule: 'loss' | 'streak' | 'count'
  message: string
}

export function evaluateDay(rows: Row[], date: string, rules: Pick<RiskRules, 'dailyLossLimit' | 'maxConsecutiveLosses' | 'maxTradesPerDay'>): RiskWarning[] {
  const day = rows
    .filter((r) => r.trade.date === date)
    .sort((a, b) => (a.trade.id ?? 0) - (b.trade.id ?? 0))
  const out: RiskWarning[] = []
  const net = day.reduce((s, r) => s + r.res.net, 0)

  if (rules.dailyLossLimit > 0 && net <= -rules.dailyLossLimit)
    out.push({ rule: 'loss', message: `Daily loss limit hit: ₹${Math.round(-net)} lost (limit ₹${rules.dailyLossLimit}).` })

  let streak = 0
  for (let i = day.length - 1; i >= 0 && day[i].res.net < 0; i--) streak++
  if (rules.maxConsecutiveLosses > 0 && streak >= rules.maxConsecutiveLosses)
    out.push({ rule: 'streak', message: `${streak} losses in a row (limit ${rules.maxConsecutiveLosses}). Consider stopping for the day.` })

  if (rules.maxTradesPerDay > 0 && day.length >= rules.maxTradesPerDay)
    out.push({ rule: 'count', message: `${day.length} trades taken (limit ${rules.maxTradesPerDay}). Overtrading?` })

  return out
}
