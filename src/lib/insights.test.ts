import { describe, it, expect } from 'vitest'
import { adherence, discipline, disciplineVerdict, holdMinutes, holding, mistakeCost, overtrading, payoff, reentry, rHistogram, sizing, tilt, timeOfDay } from './insights'
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
    expect(m.table[0]).toMatchObject({ tag: 'FOMO', count: 1 })
    expect(m.table[0].full).toMatchObject({ net: -300, netWithout: 300 })
    expect(m.clean).toMatchObject({ count: 2, net: 300 })
  })
  it('multi-mistake trades: full view overlaps, split view adds up to the true total', () => {
    const m = mistakeCost([
      row(-300, { mistakes: ['FOMO', 'Moved SL'] }), // shared
      row(-100, { mistakes: ['FOMO'] }), // solo
      row(50),
    ])
    const fomo = m.table.find((t) => t.tag === 'FOMO')!
    const sl = m.table.find((t) => t.tag === 'Moved SL')!
    // full: the -300 trade is counted in both rows, so the rows sum to -700 although only -400 was lost
    expect(fomo.full.net + sl.full.net).toBe(-700)
    // split: -150 + (-100) for FOMO, -150 for Moved SL -> sums to the -400 actually lost
    expect(fomo.split.net).toBe(-250)
    expect(sl.split.net).toBe(-150)
    expect(fomo.split.net + sl.split.net).toBe(m.tagged.net)
    expect(m.tagged).toEqual({ count: 2, net: -400 })
    expect(m.multi).toEqual({ count: 1, net: -300 })
    expect(fomo.solo).toEqual({ count: 1, net: -100 })
    expect(sl.solo.count).toBe(0)
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

describe('discipline', () => {
  it('compares actual P&L with the P&L of only clean trades', () => {
    const d = discipline([
      row(200), // clean win
      row(-500, { followedPlan: false }), // broke plan
      row(100, { mistakes: ['FOMO'] }), // mistake but profitable
      row(50),
    ])
    expect(d.actual).toBe(-150)
    expect(d.disciplined).toBe(250)
    expect(d.cost).toBe(400)
    expect(d.clean).toMatchObject({ count: 2, net: 250, winRate: 100 })
    expect(d.flawed).toMatchObject({ count: 2, net: -400, winRate: 50 })
    expect(d.brokePlan).toBe(1)
    expect(d.mistaken).toBe(1)
  })
  it('a profitable flawed set gives a negative cost', () => {
    expect(discipline([row(100, { followedPlan: false }), row(10)]).cost).toBe(-100)
  })
})

describe('sizing', () => {
  it('measures oversized trades against the median and their outcome', () => {
    const z = sizing([row(50, { qty: 10 }), row(60, { qty: 10 }), row(-40, { qty: 10 }), row(-300, { qty: 40 })]) // sizes 1000,1000,1000,4000
    expect(z.median).toBe(1000)
    expect(z.biggestRatio).toBe(4)
    expect(z.oversized).toMatchObject({ count: 1, avgNet: -300 })
    expect(z.normal.count).toBe(3)
    expect(z.cv).toBeGreaterThan(0.5)
  })
  it('detects sizing up after losses, within a day only', () => {
    const z = sizing([
      row(-100, { entryTime: '09:20', qty: 10 }),
      row(-100, { entryTime: '09:40', qty: 20 }), // after a loss, 2x
      row(-100, { entryTime: '10:00', qty: 30 }), // after 2 losses, 3x
      row(50, { date: '2026-09-02', entryTime: '09:20', qty: 10 }), // new day: not counted
    ])
    expect(z.median).toBe(1500) // sizes 1000,2000,3000,1000 -> median (1000+2000)/2
    expect(z.afterLoss.count).toBe(2)
    expect(z.afterTwoLosses.count).toBe(1)
    expect(z.afterTwoLosses.ratio).toBeCloseTo(2) // 3000 / 1500
    expect(z.afterWin.count).toBe(0)
  })
  it('is safe with no data', () => {
    expect(sizing([])).toMatchObject({ median: 0, cv: 0, biggestRatio: 0 })
  })
})

describe('reentry', () => {
  it('buckets the gap between exiting a trade and entering the next, by how the previous one ended', () => {
    const r = reentry([
      row(-100, { entryTime: '09:20', exitTime: '09:40' }),
      row(-200, { entryTime: '09:42', exitTime: '09:50' }), // 2 min after a loss
      row(300, { entryTime: '10:30', exitTime: '10:50' }), // 40 min after a loss
      row(20, { entryTime: '11:00', exitTime: '11:10' }), // 10 min after a win
    ])
    expect(r.quick).toEqual({ count: 1, net: -200, avgNet: -200 })
    expect(r.slower.count).toBe(1)
    expect(r.afterLoss.map((b) => b.name)).toEqual(['< 5 min', '15–60 min'])
    expect(r.afterWin.map((b) => b.name)).toEqual(['5–15 min'])
    expect(r.measured).toBe(3)
    expect(r.missing).toBe(0)
  })
  it('counts pairs lacking times and ignores other days', () => {
    const r = reentry([
      row(-100, { entryTime: '09:20' }), // no exit time
      row(50, { entryTime: '09:40' }),
      row(10, { date: '2026-09-02', entryTime: '09:20', exitTime: '09:30' }),
    ])
    expect(r.measured).toBe(0)
    expect(r.missing).toBe(1)
  })
})

describe('disciplineVerdict', () => {
  const v = (rows: Row[]) => disciplineVerdict(discipline(rows))
  const clean = (n: number) => Array.from({ length: 5 }, () => row(n))
  const flawed = (n: number) => Array.from({ length: 5 }, () => row(n, { followedPlan: false }))

  it('clean up, flawed down: discipline would have helped', () => {
    const r = v([...clean(100), ...flawed(-50)])
    expect(r.tone).toBe('warn')
    expect(r.text).toContain('would have improved your P&L by ₹250')
  })
  it('clean down, flawed up: says the plan is the problem and never claims discipline would have paid', () => {
    const r = v([...clean(-100), ...flawed(80)])
    expect(r.tone).toBe('info')
    expect(r.text).toContain('Following the plan would NOT have helped')
    expect(r.text).toContain('the plan itself')
    expect(r.text).not.toContain('improved your P&L')
  })
  it('both up, and both down', () => {
    expect(v([...clean(10), ...flawed(20)]).text).toContain('Both groups made money')
    const both = v([...clean(-10), ...flawed(-20)])
    expect(both.text).toContain('Both groups lost')
    expect(both.text).toContain('not profitable yet')
  })
  it('handles no flawed trades, no clean trades, and small samples', () => {
    expect(v(clean(10)).tone).toBe('good')
    expect(v(flawed(10)).text).toContain('nothing to compare')
    expect(v([row(100), row(-50, { followedPlan: false })]).text).toContain('sample is small')
  })
})

describe('exit mistakes', () => {
  const exit = ['Early exit', 'Moved SL']

  it('discipline ignores exit tags: an early-exit-only trade stays clean', () => {
    const rows = [row(200, { mistakes: ['Early exit'] }), row(-100, { mistakes: ['FOMO'] }), row(50)]
    const d = discipline(rows, exit)
    expect(d.clean).toMatchObject({ count: 2, net: 250 }) // the early exit + the plain trade
    expect(d.flawed).toMatchObject({ count: 1, net: -100 })
    expect(d.mistaken).toBe(1)
    // without the setting, the early exit is flawed as before
    expect(discipline(rows).clean.count).toBe(1)
  })
  it('a trade with an exit tag AND another problem is still flawed', () => {
    expect(discipline([row(-50, { mistakes: ['Early exit', 'FOMO'] }), row(10)], exit).flawed.count).toBe(1)
    expect(discipline([row(-50, { mistakes: ['Early exit'], followedPlan: false }), row(10)], exit).flawed.count).toBe(1)
  })
  it('mistake cost prices only entry/behaviour tags and reports exit tags as counts', () => {
    const m = mistakeCost([
      row(-300, { mistakes: ['FOMO', 'Early exit'] }), // splits over FOMO only
      row(400, { mistakes: ['Early exit'] }),
      row(100, { mistakes: ['Moved SL'] }),
      row(20),
    ], exit)
    expect(m.table.map((t) => t.tag)).toEqual(['FOMO'])
    expect(m.table[0].split.net).toBe(-300)
    expect(m.tagged).toEqual({ count: 1, net: -300 })
    expect(m.clean.count).toBe(3)
    expect(m.exit.trades).toBe(3)
    expect(m.exit.tags).toEqual([{ tag: 'Early exit', count: 2 }, { tag: 'Moved SL', count: 1 }])
  })
  it('adherence totals the money left on the table by exiting in profit before target', () => {
    const a = adherence([
      row(0, { entryPrice: 100, stopLoss: 98, target: 106, exitPrice: 104, qty: 10 }), // 2 x 10 = 20 left
      row(0, { side: 'Short', entryPrice: 100, stopLoss: 102, target: 94, exitPrice: 97, qty: 5 }), // 3 x 5 = 15 left
      row(0, { entryPrice: 100, stopLoss: 98, target: 106, exitPrice: 107, qty: 10 }), // reached target: none
    ])
    expect(a.exitedEarly).toBe(2)
    expect(a.leftAmount).toBe(35)
  })
})
