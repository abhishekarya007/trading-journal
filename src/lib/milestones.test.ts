import { describe, it, expect } from 'vitest'
import { milestones, streaks } from './milestones'
import { DEFAULT_SETTINGS } from './defaults'
import type { Row } from './stats'
import type { Trade } from './types'

let id = 0
const row = (date: string, net: number, t: Partial<Trade> = {}): Row => ({
  trade: { id: ++id, date, symbol: 'ABC', side: 'Long', qty: 1, entryPrice: 100, exitPrice: 100, setup: 'Breakout', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '', ...t },
  res: { net, gross: net, charges: { total: 0 } as never, rMultiple: null, returnPct: 0 },
})
const d = (n: number) => `2026-09-${String(n).padStart(2, '0')}`
const settings = { ...DEFAULT_SETTINGS, risk: { ...DEFAULT_SETTINGS.risk, dailyLossLimit: 500, maxTradesPerDay: 2 } }

describe('streaks', () => {
  it('counts consecutive trading days, tracks the best run, and ignores days off', () => {
    // green: 1,2,3 then a red day, then green 6,7. Days 4,5 weekend-like gaps have no trades.
    const rows = [row(d(1), 10), row(d(2), 10), row(d(3), 10), row(d(4), -5), row(d(7), 10), row(d(8), 10)]
    const s = streaks(rows, settings)
    expect(s.greenDays).toMatchObject({ cur: 2, best: 3 })
    expect(s.greenDays.reachedOn(3)).toBe(d(3))
    expect(s.greenDays.reachedOn(4)).toBeNull()
  })
  it('measures loss-limit, mistake-free, plan and trade-count streaks', () => {
    const rows = [
      row(d(1), -100), row(d(2), -600), // second day passes the 500 limit
      row(d(3), 10, { mistakes: ['FOMO'] }), row(d(4), 10, { followedPlan: false }), row(d(5), 5), row(d(5), 5), row(d(5), 5), // day 5: 3 trades, over the cap of 2
    ]
    const s = streaks(rows, settings)
    expect(s.withinLoss).toMatchObject({ cur: 3, best: 3 }) // days 3,4,5 inside; day 2 broke it
    expect(s.noMistake.cur).toBe(2) // days 4 and 5
    expect(s.plan.cur).toBe(1) // only day 5 after the plan-breaking day 4
    expect(s.withinTrades).toMatchObject({ cur: 0, best: 4 })
  })
  it('returns null for limits that are not set', () => {
    const s = streaks([row(d(1), 1)], { ...DEFAULT_SETTINGS, risk: { ...DEFAULT_SETTINGS.risk, dailyLossLimit: 0, maxTradesPerDay: 0 } })
    expect(s.withinLoss).toBeNull()
    expect(s.withinTrades).toBeNull()
  })
})

describe('milestones', () => {
  it('reports logging milestones with the date they were reached, and progress for the rest', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(d(i + 1), 1))
    const m = milestones(rows, settings, '2026-10')
    const first = m.find((x) => x.id === 'trades-1')!
    expect(first).toMatchObject({ achievedOn: d(1), value: 1, target: 1 })
    expect(m.find((x) => x.id === 'trades-10')!.achievedOn).toBe(d(10))
    const fifty = m.find((x) => x.id === 'trades-50')!
    expect(fifty).toMatchObject({ achievedOn: null, value: 12, target: 50 })
  })
  it('recognises green streaks, a green week, a completed green month and a reached monthly goal', () => {
    const rows = [d(1), d(2), d(3), d(4), d(5)].map((x) => row(x, 200)) // Tue..Sat? 5 green days, one week
    const m = milestones(rows, { ...settings, goals: { profit: 800, maxLoss: 0 } }, '2026-10')
    expect(m.find((x) => x.id === 'green-3')!.achievedOn).toBe(d(3))
    expect(m.find((x) => x.id === 'green-5')!.achievedOn).toBe(d(5))
    expect(m.find((x) => x.id === 'green-10')!.achievedOn).toBeNull()
    expect(m.find((x) => x.id === 'green-month')!.achievedOn).not.toBeNull() // September is finished and green
    expect(m.find((x) => x.id === 'goal-month')!.achievedOn).toBe(d(4)) // 4 x 200 = 800
    // the current month does not count as a finished green month
    expect(milestones(rows, settings, '2026-09').find((x) => x.id === 'green-month')!.achievedOn).toBeNull()
  })
  it('only offers loss-limit milestones when a limit is set, and caps progress at the target', () => {
    const none = milestones([row(d(1), 1)], { ...settings, risk: { ...settings.risk, dailyLossLimit: 0 } }, '2026-10')
    expect(none.some((x) => x.id.startsWith('limit-'))).toBe(false)
    const m = milestones(Array.from({ length: 30 }, (_, i) => row(d(i + 1), 1)), settings, '2026-10')
    expect(m.find((x) => x.id === 'trades-10')).toMatchObject({ value: 10, target: 10 })
  })
})
