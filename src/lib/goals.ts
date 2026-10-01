import type { RiskWarning } from './risk'
import { addDays, localDate } from './week'

export type LossState = 'off' | 'ok' | 'warn' | 'hit'
export type Pace = 'ahead' | 'on' | 'behind'

export interface GoalStatus {
  goal: number
  maxLoss: number
  net: number
  goalPct: number // net as % of the goal (can pass 100)
  goalLeft: number // ₹ still to make
  reached: boolean
  lossUsed: number // ₹ lost so far this month (0 when in profit)
  lossUsedPct: number // % of the loss limit used
  lossLeft: number // ₹ left before the limit
  lossState: LossState
  weekdaysLeft: number // Mon-Fri days left in the month, today included
  perDayNeeded: number | null // ₹ a weekday needed to reach the goal
  pace: Pace | null
}

const WARN_AT = 70 // % of the loss limit that triggers a heads-up

const parts = (month: string) => { const [y, m] = month.split('-').map(Number); return { y, m } }
const isWeekday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6

/** Mon-Fri days in the month from `from` (a YYYY-MM-DD date) onwards, and in the whole month. NSE holidays aren't known. */
export function weekdaysInMonth(month: string, from?: string) {
  const { y, m } = parts(month)
  const days = new Date(y, m, 0).getDate()
  let total = 0
  let left = 0
  for (let d = 1; d <= days; d++) {
    const dt = new Date(y, m - 1, d)
    if (!isWeekday(dt)) continue
    total++
    const key = `${month}-${String(d).padStart(2, '0')}`
    if (!from || key >= from) left++
  }
  return { total, left }
}

export function goalStatus(net: number, goal: number, maxLoss: number, month: string, today = localDate()): GoalStatus {
  const lossUsed = Math.max(0, -net)
  const lossUsedPct = maxLoss > 0 ? (lossUsed / maxLoss) * 100 : 0
  const lossState: LossState = maxLoss <= 0 ? 'off' : lossUsedPct >= 100 ? 'hit' : lossUsedPct >= WARN_AT ? 'warn' : 'ok'
  const reached = goal > 0 && net >= goal
  const goalLeft = goal > 0 ? Math.max(0, goal - net) : 0

  const current = today.slice(0, 7)
  const wd = weekdaysInMonth(month, month === current ? today : month < current ? addDays(`${month}-28`, 40) : undefined)
  const weekdaysLeft = month < current ? 0 : wd.left
  const elapsedPct = wd.total > 0 ? ((wd.total - weekdaysLeft) / wd.total) * 100 : 0
  const goalPct = goal > 0 ? (net / goal) * 100 : 0
  let pace: Pace | null = null
  if (goal > 0 && !reached && month === current) pace = goalPct >= elapsedPct + 10 ? 'ahead' : goalPct >= elapsedPct - 10 ? 'on' : 'behind'

  return {
    goal, maxLoss, net, goalPct, goalLeft, reached,
    lossUsed, lossUsedPct, lossLeft: maxLoss > 0 ? Math.max(0, maxLoss - lossUsed) : 0, lossState,
    weekdaysLeft,
    perDayNeeded: goal > 0 && !reached && weekdaysLeft > 0 ? goalLeft / weekdaysLeft : null,
    pace,
  }
}

const money = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`

/** A heads-up for the dashboard and the trade form when the month's loss is close to, or past, the limit. */
export function monthLimitWarnings(s: GoalStatus): RiskWarning[] {
  if (s.lossState === 'hit') return [{ rule: 'month', message: `Monthly loss limit reached: ${money(s.lossUsed)} lost of ${money(s.maxLoss)}. Consider stopping for the month.` }]
  if (s.lossState === 'warn') return [{ rule: 'month', message: `You have used ${Math.round(s.lossUsedPct)}% of your monthly loss limit (${money(s.lossUsed)} of ${money(s.maxLoss)}). ${money(s.lossLeft)} left.` }]
  return []
}
