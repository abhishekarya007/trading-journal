import type { Settings } from './types'
import type { Row } from './stats'
import { dayList, type Day } from './habits'
import { addDays, weekStart } from './week'

export interface Streak { cur: number; best: number; reachedOn: (n: number) => string | null }
export interface StreakSet {
  greenDays: Streak // days finishing in profit
  withinLoss: Streak | null // days that stayed inside the daily loss limit (null when no limit is set)
  noMistake: Streak // days with no mistake tagged on any trade
  plan: Streak // days where every trade followed the plan
  withinTrades: Streak | null // days at or under the max trades per day (null when not set)
}

/** Consecutive TRADING days that satisfy `ok`; days without trades are skipped, not counted as breaks. */
function runs(days: Day[], ok: (d: Day) => boolean): Streak {
  let run = 0
  let best = 0
  const firstReach = new Map<number, string>()
  for (const d of days) {
    run = ok(d) ? run + 1 : 0
    best = Math.max(best, run)
    if (run > 0 && !firstReach.has(run)) firstReach.set(run, d.date)
  }
  return { cur: run, best, reachedOn: (n) => firstReach.get(n) ?? null }
}

export function streaks(rows: Row[], settings: Pick<Settings, 'risk'>): StreakSet {
  const days = dayList(rows)
  const lim = settings.risk.dailyLossLimit
  const max = settings.risk.maxTradesPerDay
  return {
    greenDays: runs(days, (d) => d.net > 0),
    withinLoss: lim > 0 ? runs(days, (d) => d.net > -lim) : null,
    noMistake: runs(days, (d) => d.rows.every((r) => r.trade.mistakes.length === 0)),
    plan: runs(days, (d) => d.rows.every((r) => r.trade.followedPlan)),
    withinTrades: max > 0 ? runs(days, (d) => d.count <= max) : null,
  }
}

export type MilestoneGroup = 'Logging' | 'Results' | 'Discipline'
export interface Milestone {
  id: string
  group: MilestoneGroup
  title: string
  detail: string
  achievedOn: string | null // date it was first reached
  value: number // progress so far
  target: number
}

const mk = (id: string, group: MilestoneGroup, title: string, detail: string, value: number, target: number, achievedOn: string | null): Milestone =>
  ({ id, group, title, detail, achievedOn: value >= target ? achievedOn : null, value: Math.min(value, target), target })

/** Every milestone, reached or not, with progress. Computed from your trades, nothing extra is stored. */
export function milestones(rows: Row[], settings: Settings, currentMonth: string): Milestone[] {
  const sorted = [...rows].sort((a, b) => a.trade.date.localeCompare(b.trade.date) || (a.trade.id ?? 0) - (b.trade.id ?? 0))
  const days = dayList(rows)
  const out: Milestone[] = []

  for (const n of [1, 10, 50, 100, 250, 500])
    out.push(mk(`trades-${n}`, 'Logging', n === 1 ? 'First trade logged' : `${n} trades logged`, 'Every trade you record is data you can learn from.', sorted.length, n, sorted[n - 1]?.trade.date ?? null))
  for (const n of [20, 50, 100])
    out.push(mk(`days-${n}`, 'Logging', `${n} trading days`, 'Days you traded and journaled.', days.length, n, days[n - 1]?.date ?? null))

  const st = streaks(rows, settings)
  for (const n of [3, 5, 10])
    out.push(mk(`green-${n}`, 'Results', `${n} green days in a row`, 'Consecutive trading days that ended in profit.', st.greenDays.best, n, st.greenDays.reachedOn(n)))

  const weeks = new Map<string, { net: number; days: Set<string> }>()
  for (const r of rows) {
    const k = weekStart(r.trade.date)
    const w = weeks.get(k) ?? { net: 0, days: new Set<string>() }
    w.net += r.res.net
    w.days.add(r.trade.date)
    weeks.set(k, w)
  }
  const greenWeek = [...weeks.entries()].filter(([, w]) => w.net > 0 && w.days.size >= 3).sort(([a], [b]) => a.localeCompare(b))[0]
  out.push(mk('green-week', 'Results', 'First green week', 'A week of at least 3 trading days that ended in profit.', greenWeek ? 1 : 0, 1, greenWeek ? addDays(greenWeek[0], 6) : null))

  const months = new Map<string, number>()
  for (const r of rows) months.set(r.trade.date.slice(0, 7), (months.get(r.trade.date.slice(0, 7)) ?? 0) + r.res.net)
  const greenMonth = [...months.entries()].filter(([m, net]) => m < currentMonth && net > 0).sort(([a], [b]) => a.localeCompare(b))[0]
  out.push(mk('green-month', 'Results', 'First green month', 'A full month that ended in profit.', greenMonth ? 1 : 0, 1, greenMonth ? `${greenMonth[0]}-28` : null))

  // Monthly goal reached: the first date a month's running profit passed its goal.
  const goalMonth = (() => {
    let hit: string | null = null
    for (const [m] of [...months.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const goal = settings.monthGoal?.[m] ?? settings.goals?.profit ?? 0
      if (goal <= 0) continue
      let cum = 0
      for (const r of sorted.filter((x) => x.trade.date.startsWith(m))) {
        cum += r.res.net
        if (cum >= goal) { hit = hit ?? r.trade.date; break }
      }
    }
    return hit
  })()
  out.push(mk('goal-month', 'Results', 'Monthly profit goal reached', 'Your running profit for a month passed its goal.', goalMonth ? 1 : 0, 1, goalMonth))

  for (const n of [5, 10])
    if (st.withinLoss) out.push(mk(`limit-${n}`, 'Discipline', `${n} days inside your loss limit`, 'Consecutive trading days that never went past your daily loss limit.', st.withinLoss.best, n, st.withinLoss.reachedOn(n)))
  for (const n of [5, 10])
    out.push(mk(`plan-${n}`, 'Discipline', `${n} days following your plan`, 'Consecutive trading days where every trade followed the plan.', st.plan.best, n, st.plan.reachedOn(n)))
  out.push(mk('clean-5', 'Discipline', '5 mistake-free days', 'Consecutive trading days with no mistake tagged.', st.noMistake.best, 5, st.noMistake.reachedOn(5)))
  if (st.withinTrades) out.push(mk('trades-cap-5', 'Discipline', '5 days within your trade limit', 'Consecutive trading days at or under your max trades per day.', st.withinTrades.best, 5, st.withinTrades.reachedOn(5)))
  return out
}
