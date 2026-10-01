import { describe, it, expect } from 'vitest'
import { goalStatus, monthLimitWarnings, weekdaysInMonth } from './goals'
import { monthlyCapital } from './capital'
import type { Row } from './stats'

const row = (date: string, net: number): Row => ({ trade: { date } as Row['trade'], res: { net } as Row['res'] })

describe('weekdaysInMonth', () => {
  it('counts Mon-Fri days, and how many are left from a date', () => {
    expect(weekdaysInMonth('2026-10').total).toBe(22) // October 2026
    expect(weekdaysInMonth('2026-10', '2026-10-01').left).toBe(22)
    expect(weekdaysInMonth('2026-10', '2026-10-30').left).toBe(1) // Friday the 30th
    expect(weekdaysInMonth('2026-10', '2026-10-31').left).toBe(0) // Saturday
  })
})

describe('goalStatus', () => {
  const today = '2026-10-14' // Wednesday
  it('tracks progress to the profit goal and what is left per remaining weekday', () => {
    const s = goalStatus(2000, 10000, 0, '2026-10', today)
    expect(s).toMatchObject({ goalPct: 20, goalLeft: 8000, reached: false, lossState: 'off', lossUsed: 0 })
    expect(s.weekdaysLeft).toBe(13) // Oct 14..30 weekdays
    expect(s.perDayNeeded).toBeCloseTo(8000 / 13, 5)
  })
  it('marks the goal reached and stops asking for a daily pace', () => {
    const s = goalStatus(12000, 10000, 0, '2026-10', today)
    expect(s).toMatchObject({ reached: true, goalLeft: 0, perDayNeeded: null, pace: null })
    expect(s.goalPct).toBe(120)
  })
  it('compares progress with how much of the month has passed', () => {
    const elapsed = 9 / 22 * 100 // 9 of 22 weekdays gone, about 41%
    expect(elapsed).toBeGreaterThan(40)
    expect(goalStatus(8000, 10000, 0, '2026-10', today).pace).toBe('ahead')
    expect(goalStatus(4000, 10000, 0, '2026-10', today).pace).toBe('on')
    expect(goalStatus(500, 10000, 0, '2026-10', today).pace).toBe('behind')
    expect(goalStatus(500, 10000, 0, '2026-09', today).pace).toBeNull() // a past month has no pace
  })
  it('tracks the loss limit: ok, warning from 70%, hit at 100%; profit never uses it', () => {
    expect(goalStatus(-1000, 0, 5000, '2026-10', today)).toMatchObject({ lossState: 'ok', lossUsed: 1000, lossUsedPct: 20, lossLeft: 4000 })
    expect(goalStatus(-3500, 0, 5000, '2026-10', today).lossState).toBe('warn')
    expect(goalStatus(-5000, 0, 5000, '2026-10', today)).toMatchObject({ lossState: 'hit', lossLeft: 0 })
    expect(goalStatus(-9000, 0, 5000, '2026-10', today).lossLeft).toBe(0)
    expect(goalStatus(800, 0, 5000, '2026-10', today)).toMatchObject({ lossState: 'ok', lossUsed: 0, lossLeft: 5000 })
    expect(goalStatus(-100, 0, 0, '2026-10', today).lossState).toBe('off')
  })
  it('a past month has no days left, a future month has all its weekdays', () => {
    expect(goalStatus(0, 1000, 0, '2026-09', today).weekdaysLeft).toBe(0)
    expect(goalStatus(0, 1000, 0, '2026-11', today).weekdaysLeft).toBe(weekdaysInMonth('2026-11').total)
  })
})

describe('monthLimitWarnings', () => {
  it('says nothing when fine, warns near the limit, and is firm at the limit', () => {
    expect(monthLimitWarnings(goalStatus(-100, 0, 5000, '2026-10', '2026-10-14'))).toEqual([])
    expect(monthLimitWarnings(goalStatus(-4000, 0, 5000, '2026-10', '2026-10-14'))[0].message).toContain('80% of your monthly loss limit')
    expect(monthLimitWarnings(goalStatus(-5200, 0, 5000, '2026-10', '2026-10-14'))[0].message).toContain('Monthly loss limit reached')
    expect(monthLimitWarnings(goalStatus(-5200, 0, 0, '2026-10', '2026-10-14'))).toEqual([])
  })
})

describe('monthly goals follow the same carry-forward rule as capital', () => {
  const base = { startingCapital: 100000, monthCapital: {}, goals: { profit: 5000, maxLoss: 3000 }, monthGoal: {} as Record<string, number>, monthMaxLoss: {} as Record<string, number> }
  it('uses the default until a month has its own amount, then keeps using that amount', () => {
    const m = monthlyCapital([row('2026-08-03', 100), row('2026-09-02', 100), row('2026-10-02', 100)], { ...base, monthGoal: { '2026-09': 8000 }, monthMaxLoss: { '2026-10': 2000 } }, '2026-10')
    expect(m.get('2026-08')).toMatchObject({ goal: 5000, maxLoss: 3000, goalOverridden: false })
    expect(m.get('2026-09')).toMatchObject({ goal: 8000, maxLoss: 3000, goalOverridden: true })
    expect(m.get('2026-10')).toMatchObject({ goal: 8000, maxLoss: 2000, goalOverridden: false, maxLossOverridden: true })
  })
  it('is zero (off) when nothing is set, and still works for old settings without these fields', () => {
    const m = monthlyCapital([row('2026-10-02', 1)], { startingCapital: 100000, monthCapital: {} }, '2026-10')
    expect(m.get('2026-10')).toMatchObject({ goal: 0, maxLoss: 0 })
  })
})
