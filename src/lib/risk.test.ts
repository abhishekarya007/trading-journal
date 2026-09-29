import { describe, it, expect } from 'vitest'
import { evaluateDay } from './risk'
import type { Row } from './stats'

const row = (id: number, net: number, date = '2026-09-01'): Row =>
  ({ trade: { id, date } as Row['trade'], res: { net } as Row['res'] })
const rules = { dailyLossLimit: 1000, maxConsecutiveLosses: 3, maxTradesPerDay: 5 }

describe('evaluateDay', () => {
  it('flags daily loss limit', () => {
    expect(evaluateDay([row(1, -600), row(2, -500)], '2026-09-01', rules).map((w) => w.rule)).toContain('loss')
  })
  it('flags trailing losing streak only', () => {
    const w = evaluateDay([row(1, -10), row(2, 500), row(3, -10), row(4, -10), row(5, -10)], '2026-09-01', { ...rules, maxTradesPerDay: 10 })
    expect(w.map((x) => x.rule)).toEqual(['streak'])
    expect(evaluateDay([row(1, -10), row(2, -10), row(3, -10), row(4, 5)], '2026-09-01', rules)).toEqual([])
  })
  it('flags trade count, ignores other days, and 0 disables', () => {
    const many = [1, 2, 3, 4, 5].map((i) => row(i, 1))
    expect(evaluateDay(many, '2026-09-01', rules).map((w) => w.rule)).toEqual(['count'])
    expect(evaluateDay(many, '2026-09-02', rules)).toEqual([])
    expect(evaluateDay(many, '2026-09-01', { dailyLossLimit: 0, maxConsecutiveLosses: 0, maxTradesPerDay: 0 })).toEqual([])
  })
})
