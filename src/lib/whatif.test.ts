import { describe, it, expect } from 'vitest'
import { eachRuleAlone, simulate } from './whatif'
import { calcTrade } from './calc'
import { DEFAULT_SETTINGS } from './defaults'
import type { Row } from './stats'
import type { Trade } from './types'

const rates = DEFAULT_SETTINGS.rates
const opts = { rates, exitTags: ['Early exit', 'Moved SL'] }
let id = 0
const row = (net: number, t: Partial<Trade> = {}): Row => {
  const trade: Trade = { id: ++id, date: '2026-09-01', symbol: 'ABC', side: 'Long', qty: 10, entryPrice: 100, exitPrice: 100, setup: 'Breakout', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '', ...t }
  return { trade, res: { net, gross: net, charges: { total: 0 } as never, rMultiple: null, returnPct: 0 } }
}
const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}`

describe('simulate', () => {
  it('with no rules it changes nothing', () => {
    const rows = [row(100), row(-50), row(20)]
    const r = simulate(rows, {}, opts)
    expect(r.kept).toHaveLength(3)
    expect(r.removed).toEqual([])
    expect(r.delta).toBe(0)
  })
  it('max trades per day keeps the first N of each day in time order', () => {
    const rows = [
      row(100, { entryTime: '09:30' }), row(-300, { entryTime: '10:00' }), row(-200, { entryTime: '11:00' }), // day 1: the 2nd and 3rd lose
      row(50, { date: day(2), entryTime: '09:30' }),
    ]
    const r = simulate(rows, { maxTradesPerDay: 1 }, opts)
    expect(r.kept.map((x) => x.res.net)).toEqual([100, 50])
    expect(r.removed.map((x) => x.rule)).toEqual(['maxTradesPerDay', 'maxTradesPerDay'])
    expect(r.removedNet).toBe(-500)
    expect(r.delta).toBe(500) // skipping two losers would have made 500 more
    expect(r.removedLosses).toBe(2)
  })
  it('stop after N losses and the daily loss limit use the day so far, not the whole day', () => {
    const rows = [row(-100, { entryTime: '09:30' }), row(-100, { entryTime: '10:00' }), row(400, { entryTime: '11:00' })]
    const a = simulate(rows, { stopAfterLosses: 2 }, opts)
    expect(a.kept).toHaveLength(2)
    expect(a.delta).toBe(-400) // the rule would have cost you the day's winner
    const b = simulate(rows, { dailyLossLimit: 150 }, opts) // -100, -100 => -200 <= -150 so the third is skipped
    expect(b.removed).toHaveLength(1)
    const c = simulate(rows, { dailyLossLimit: 250 }, opts) // never reaches 250 before the third
    expect(c.removed).toHaveLength(0)
  })
  it('time rules remove trades by entry time and leave untimed trades alone', () => {
    const rows = [row(-100, { entryTime: '09:20' }), row(50, { entryTime: '09:40' }), row(30), row(-80, { entryTime: '14:45' })]
    expect(simulate(rows, { skipFirstMinutes: 15 }, opts).removed.map((x) => x.row.res.net)).toEqual([-100]) // 09:20 < 09:30
    expect(simulate(rows, { noEntriesAfter: '14:30' }, opts).removed.map((x) => x.row.res.net)).toEqual([-80])
    expect(simulate(rows, { skipFirstMinutes: 15, noEntriesAfter: '14:30' }, opts).kept).toHaveLength(2)
  })
  it('can skip a setup, and plan-breaking or mistaken trades (but not exit-only mistakes)', () => {
    const rows = [
      row(-100, { setup: 'Gap' }), row(60), row(-70, { followedPlan: false }), row(-30, { mistakes: ['FOMO'] }), row(90, { mistakes: ['Early exit'] }),
    ]
    expect(simulate(rows, { skipSetup: 'Gap' }, opts).removed).toHaveLength(1)
    const f = simulate(rows, { skipFlawed: true }, opts)
    expect(f.removed.map((x) => x.row.res.net).sort((a, b) => a - b)).toEqual([-70, -30])
    expect(f.kept.map((x) => x.res.net)).toContain(90) // an early exit on its own is not a reason to skip
  })
  it('capping losses re-prices the exit at X times the risk, charges included, and ignores trades without a stop', () => {
    const loser = { ...row(0), trade: { ...row(0).trade, entryPrice: 100, stopLoss: 98, exitPrice: 92, qty: 10 } } // lost 4R by price
    loser.res = calcTrade(loser.trade, rates)
    const noStop = { ...row(0), trade: { ...row(0).trade, entryPrice: 100, exitPrice: 90, qty: 10 } }
    noStop.res = calcTrade(noStop.trade, rates)
    const r = simulate([loser, noStop], { capLossR: 1 }, opts)
    expect(r.capped).toBe(1)
    const capped = r.kept.find((x) => x.trade.stopLoss)!
    expect(capped.trade.exitPrice).toBe(98) // 100 - 1 x 2
    expect(capped.res.gross).toBe(-20) // 10 shares x 2
    expect(capped.res.net).toBeCloseTo(-20 - capped.res.charges.total, 5)
    expect(r.delta).toBeGreaterThan(0) // 4R loss became ~1R
    // a loss already inside the cap is untouched, and so is a winner
    const small = { ...row(0), trade: { ...row(0).trade, entryPrice: 100, stopLoss: 98, exitPrice: 99, qty: 10 } }
    small.res = calcTrade(small.trade, rates)
    expect(simulate([small], { capLossR: 1 }, opts).capped).toBe(0)
  })
  it('works for shorts too', () => {
    const t = { ...row(0), trade: { ...row(0).trade, side: 'Short' as const, entryPrice: 100, stopLoss: 102, exitPrice: 108, qty: 10 } }
    t.res = calcTrade(t.trade, rates)
    const r = simulate([t], { capLossR: 1 }, opts)
    expect(r.kept[0].trade.exitPrice).toBe(102)
  })
  it('combines rules and attributes each removed trade to the first rule that caught it', () => {
    const rows = [row(-100, { entryTime: '09:20', setup: 'Gap' }), row(-100, { entryTime: '09:40' }), row(-100, { entryTime: '10:00' }), row(100, { entryTime: '10:30' })]
    const r = simulate(rows, { skipSetup: 'Gap', maxTradesPerDay: 2 }, opts)
    expect(r.byRule).toEqual({ skipSetup: 1, maxTradesPerDay: 1 })
    expect(r.kept).toHaveLength(2)
  })
})

describe('eachRuleAlone', () => {
  it('shows what every switched-on rule would do by itself', () => {
    const rows = [row(100, { entryTime: '09:30' }), row(-300, { entryTime: '10:00' }), row(-200, { entryTime: '11:00' })]
    const each = eachRuleAlone(rows, { maxTradesPerDay: 1, stopAfterLosses: 1 }, opts)
    expect(each.map((x) => x.rule).sort()).toEqual(['maxTradesPerDay', 'stopAfterLosses'])
    expect(each.find((x) => x.rule === 'maxTradesPerDay')).toMatchObject({ delta: 500, removed: 2 })
    expect(each.find((x) => x.rule === 'stopAfterLosses')).toMatchObject({ delta: 200, removed: 1 }) // stops after the first loss, skipping only the last
    expect(eachRuleAlone(rows, {}, opts)).toEqual([])
  })
})
