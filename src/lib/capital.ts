import type { Settings } from './types'
import type { Row } from './stats'

export interface MonthCap {
  month: string // YYYY-MM
  capital: number // the fixed amount traded with all month
  net: number
  returnPct: number // net P&L as % of that month's capital
  overridden: boolean // capital was typed in for this month
  trades: number
  goal: number // profit goal for the month in ₹ (0 = none)
  maxLoss: number // loss limit for the month in ₹ (0 = none)
  goalOverridden: boolean
  maxLossOverridden: boolean
}

const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

/**
 * The fixed trading capital for each month, from the first month with data (or a typed amount) to the
 * current month. Every month is independent: profits and losses never roll into the next month's capital.
 * A month uses the amount typed for it; otherwise the most recent earlier amount is reused, and before any
 * amount was typed the default (`startingCapital`) applies.
 */
export function monthlyCapital(
  rows: Row[],
  settings: Pick<Settings, 'startingCapital' | 'monthCapital'> & Partial<Pick<Settings, 'goals' | 'monthGoal' | 'monthMaxLoss'>>,
  currentMonth: string,
): Map<string, MonthCap> {
  const out = new Map<string, MonthCap>()
  const overrides = settings.monthCapital ?? {}
  const net = new Map<string, { net: number; n: number }>()
  for (const r of rows) {
    const k = r.trade.date.slice(0, 7)
    const e = net.get(k) ?? { net: 0, n: 0 }
    e.net += r.res.net
    e.n += 1
    net.set(k, e)
  }
  const goalOver = settings.monthGoal ?? {}
  const lossOver = settings.monthMaxLoss ?? {}
  const all = [...net.keys(), ...Object.keys(overrides), ...Object.keys(goalOver), ...Object.keys(lossOver), currentMonth].sort()
  const last = all[all.length - 1]
  let [y, m] = all[0].split('-').map(Number)

  let capital = settings.startingCapital
  let goal = settings.goals?.profit ?? 0
  let maxLoss = settings.goals?.maxLoss ?? 0
  for (;;) {
    const k = key(y, m)
    const o = overrides[k]
    const overridden = o !== undefined && Number.isFinite(o)
    if (overridden) capital = o
    const g = goalOver[k]
    const goalOverridden = g !== undefined && Number.isFinite(g)
    if (goalOverridden) goal = g
    const l = lossOver[k]
    const maxLossOverridden = l !== undefined && Number.isFinite(l)
    if (maxLossOverridden) maxLoss = l
    const e = net.get(k) ?? { net: 0, n: 0 }
    out.set(k, { month: k, capital, net: e.net, returnPct: capital > 0 ? (e.net / capital) * 100 : 0, overridden, trades: e.n, goal, maxLoss, goalOverridden, maxLossOverridden })
    if (k === last) break
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}
