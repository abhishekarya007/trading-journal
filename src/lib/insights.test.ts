import { describe, it, expect } from 'vitest'
import { adherence, holdMinutes, holding, mistakeCost, overtrading, payoff, rHistogram, tilt, timeOfDay } from './insights'
import type { Row } from './stats'
import type { Trade } from './types'

let seq = 0
const row = (net: number, t: Partial<Trade> = {}, r: number | null = null): Row => ({
  trade: {
    id: ++seq, date: '2026-09-01', symbol: 'ABC', side: 'Long', qty: 10,
    entryPrice: 100, exitPrice: 100, setup: 'Breakout', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '', ...t,
  },
  res: { net, rMultiple: r, gross: net, charges: { total: 0 } as never, returnPct: 0 },
})

describe('holding / time', () => {
  it('computes hold minutes and skips missing or reversed times', () => {
    expect(holdMinutes(row(0, { entryTime: '09:20', exitTime: '09:50' }).trade)).toBe(30)
    expect(holdMinutes(row(0, { entryTime: '09:50', exitTime: '09:20' }).trade)).toBeNull()
    expect(holdMinutes(row(0, { entryTime: '09:20' }).trade)).toBeNull()
  })
  it('averages winners vs losers and buckets P&L', () => {
    const h = holding([
      row(100, { entryTime: '09:20', exitTime: '09:50' }), // win 30m
      row(-50, { entryTime: '10:00', exitTime: '10:02' }), // loss 2m
    ])
    expect(h.avgWinMin).toBe(30)
    expect(h.avgLossMin).toBe(2)
    expect(h.buckets.map((b) => b.name)).toEqual(['<5m', '15–60m'])
  })
  it('groups by entry hour and counts untimed trades', () => {
    const t = timeOfDay([row(10, { entryTime: '09:20' }), row(-5, { entryTime: '09:50' }), row(1)])
    expect(t.data).toEqual([{ name: '09:00', net: 5, count: 2 }])
    expect(t.missing).toBe(1)
  })
})

describe('behaviour', () => {
  it('mistake cost shows net without that mistake', () => {
    const m = mistakeCost([row(-300, { mistakes: ['FOMO'] }), row(100), row(200)])
    expect(m.table[0]).toMatchObject({ tag: 'FOMO', count: 1, net: -300, netWithout: 300 })
    expect(m.clean).toMatchObject({ count: 2, net: 300 })
  })
  it('tilt compares trades after a loss vs a win, same day only', () => {
    const t = tilt([
      row(-100, { entryTime: '09:20' }),
      row(-200, { entryTime: '09:40', qty: 30 }), // after loss
      row(50, { entryTime: '10:00' }), // after loss
      row(70, { entryTime: '10:30' }), // after win
      row(10, { date: '2026-09-02', entryTime: '09:20' }), // new day: ignored
    ])
    expect(t.afterLoss.count).toBe(2)
    expect(t.afterLoss.winRate).toBe(50)
    expect(t.afterLoss.avgSize).toBe((100 * 30 + 100 * 10) / 2)
    expect(t.afterWin.count).toBe(1)
  })
  it('overtrading buckets days by trade count', () => {
    const o = overtrading([row(100), row(-20), row(50, { date: '2026-09-02' })])
    expect(o).toEqual([
      { name: '1 trade', days: 1, avgDayNet: 50, totalNet: 50 },
      { name: '2 trades', days: 1, avgDayNet: 80, totalNet: 80 },
    ])
  })
})

describe('risk & execution', () => {
  it('R histogram buckets and counts missing R', () => {
    const h = rHistogram([row(0, {}, -1.5), row(0, {}, 0.5), row(0, {}, 3.2), row(0)])
    expect(h.total).toBe(3)
    expect(h.missing).toBe(1)
    expect(h.data.find((d) => d.name === '-2 to -1R')!.count).toBe(1)
    expect(h.data.find((d) => d.name === '≥ 3R')!.count).toBe(1)
  })
  it('payoff gives break-even win rate', () => {
    const p = payoff([row(200), row(-100), row(-100)]) // avgWin 200, avgLoss 100 -> ratio 2
    expect(p.ratio).toBe(2)
    expect(p.breakevenWinRate).toBeCloseTo(33.33, 1)
  })
  it('detects held-past-stop, cut-early and target shortfalls (long)', () => {
    const a = adherence([
      row(0, { entryPrice: 100, stopLoss: 98, exitPrice: 95 }), // -2.5R price -> held past
      row(0, { entryPrice: 100, stopLoss: 98, exitPrice: 99 }), // -0.5R -> cut early
      row(0, { entryPrice: 100, stopLoss: 98, exitPrice: 98 }), // -1R -> as planned
      row(0, { entryPrice: 100, stopLoss: 98, target: 106, exitPrice: 104 }), // early exit, left 1R
      row(0, { entryPrice: 100, stopLoss: 98, target: 106, exitPrice: 107 }), // hit
    ])
    expect(a).toMatchObject({ losersWithSl: 3, heldPast: 1, cutEarly: 1, asPlanned: 1, hit: 1, exitedEarly: 1 })
    expect(a.avgOvershootR).toBeCloseTo(1.5)
    expect(a.avgLeftR).toBeCloseTo(1)
    expect(a.avgPlannedRR).toBeCloseTo(3)
  })
  it('handles shorts', () => {
    const a = adherence([row(0, { side: 'Short', entryPrice: 100, stopLoss: 102, exitPrice: 105 })]) // -2.5R
    expect(a.heldPast).toBe(1)
  })
})
