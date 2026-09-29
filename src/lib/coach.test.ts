import { describe, it, expect } from 'vitest'
import { coachRows, workOn } from './coach'
import { validateTrade } from './validate'
import { adherence } from './insights'
import type { Row } from './stats'
import type { Trade } from './types'

let id = 0
const row = (net: number, t: Partial<Trade> = {}): Row => ({
  trade: { id: ++id, date: '2026-09-01', symbol: 'ABC', side: 'Long', qty: 10, entryPrice: 100, exitPrice: 100, setup: 'Breakout', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '', ...t },
  res: { net, rMultiple: null, gross: net, charges: { total: 0 } as never, returnPct: 0 },
})
const filler = (n: number) => Array.from({ length: n }, () => row(10))

describe('workOn', () => {
  it('needs enough trades', () => {
    expect(workOn(filler(5), [])).toEqual({ items: [], total: 0, enough: false })
  })
  it('ranks costly habits by rupees, worst first, and skips profitable ones', () => {
    const rows = [
      ...filler(8),
      row(-500, { mistakes: ['FOMO'] }), row(-300, { mistakes: ['FOMO'] }), // FOMO: -800
      row(-100, { followedPlan: false }), row(-100, { followedPlan: false }), row(-50, { followedPlan: false }), // plan: -250
      row(200, { mistakes: ['Revenge trade'] }), row(300, { mistakes: ['Revenge trade'] }), // profitable: excluded
    ]
    const r = workOn(rows, [])
    expect(r.enough).toBe(true)
    expect(r.items[0]).toMatchObject({ id: 'mistake:FOMO', cost: 800 })
    expect(r.items.map((i) => i.id)).toContain('plan')
    expect(r.items.map((i) => i.id)).not.toContain('mistake:Revenge trade')
    expect(r.items.every((i, k, a) => k === 0 || a[k - 1].cost >= i.cost)).toBe(true)
  })
  it('does not price exit mistakes as tagged habits', () => {
    const rows = [...filler(8), row(-500, { mistakes: ['Early exit'] }), row(-300, { mistakes: ['Early exit'] })]
    expect(workOn(rows, ['Early exit']).items.map((i) => i.id)).not.toContain('mistake:Early exit')
  })
  it('flags exiting before target as an estimate and holding past the stop with its extra loss', () => {
    const early = (n: number) => row(50, { entryPrice: 100, stopLoss: 98, target: 106, exitPrice: 103, qty: 10 + n })
    const r = workOn([...filler(8), early(0), early(0)], [])
    const e = r.items.find((i) => i.id === 'early')!
    expect(e.estimate).toBe(true)
    expect(e.cost).toBe(3 * 10 + 3 * 10) // (106-103) x 10 qty x 2 trades
    const a = adherence([row(-500, { entryPrice: 100, stopLoss: 98, exitPrice: 94, qty: 10 }), row(-500, { entryPrice: 100, stopLoss: 98, exitPrice: 95, qty: 10 })])
    expect(a.heldPastAmount).toBe((6 - 2) * 10 + (5 - 2) * 10) // price beyond the stop x qty
  })
  it('caps the list at three', () => {
    const rows = [
      ...filler(8),
      ...['A', 'B', 'C', 'D'].flatMap((m, i) => [row(-(100 + i), { mistakes: [m] }), row(-(100 + i), { mistakes: [m] })]),
    ]
    const r = workOn(rows, [])
    expect(r.items).toHaveLength(3)
    expect(r.total).toBeGreaterThanOrEqual(4)
  })
})

describe('coachRows', () => {
  it('uses the last 30 days when there are enough trades, otherwise all', () => {
    const old = Array.from({ length: 5 }, () => row(1, { date: '2026-06-01' }))
    const recent = Array.from({ length: 12 }, () => row(1, { date: '2026-09-20' }))
    expect(coachRows([...old, ...recent], '2026-09-29').rows).toHaveLength(12)
    expect(coachRows([...old, ...recent.slice(0, 3)], '2026-09-29').rows).toHaveLength(8)
  })
})

describe('validateTrade', () => {
  const base: Trade = {
    date: '2026-09-29', symbol: 'TCS', side: 'Long', qty: 10, entryPrice: 100, exitPrice: 102, stopLoss: 98, target: 106,
    entryTime: '10:00', exitTime: '10:30', setup: 'Breakout', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '',
  }
  const v = (t: Partial<Trade>, existing: Trade[] = []) => validateTrade({ ...base, ...t }, existing, '2026-09-30')

  it('accepts a normal trade with no messages', () => {
    expect(v({})).toEqual({ errors: [], warnings: [], duplicate: null })
  })
  it('blocks future dates, fractional quantity and exit before entry', () => {
    expect(v({ date: '2026-10-05' }).errors).toContain('The date is in the future.')
    expect(v({ qty: 2.5 }).errors).toContain('Quantity must be a whole number.')
    expect(v({ entryTime: '11:00', exitTime: '10:00' }).errors).toContain('Exit time is before entry time.')
  })
  it('warns about wrong-side stop and target, for longs and shorts', () => {
    expect(v({ stopLoss: 101 }).warnings.join()).toContain('stop-loss (101) should be below')
    expect(v({ target: 99 }).warnings.join()).toContain('target (99) should be above')
    expect(v({ side: 'Short', stopLoss: 98, target: 106 }).warnings.join()).toContain('should be above')
    expect(v({ side: 'Short', entryPrice: 100, stopLoss: 102, target: 96, exitPrice: 98 }).warnings).toEqual([])
  })
  it('warns about weekends, off-hours times and a far-away exit', () => {
    expect(v({ date: '2026-09-27' }).warnings.join()).toContain('weekend') // Sunday
    expect(v({ entryTime: '08:00' }).warnings.join()).toContain('outside NSE trading hours')
    expect(v({ exitPrice: 130 }).warnings.join()).toContain('30.0% away')
  })
  it('detects an identical existing trade but not the trade being edited', () => {
    const saved: Trade = { ...base, id: 5, symbol: 'TCS' }
    expect(v({ symbol: ' tcs ' }, [saved]).duplicate?.id).toBe(5)
    expect(v({ id: 5 }, [saved]).duplicate).toBeNull() // editing itself
    expect(v({ entryTime: '10:00' }, [{ ...saved, entryTime: '10:00' }]).duplicate?.id).toBe(5)
    expect(v({ entryTime: '09:10' }, [{ ...saved, entryTime: '9:10' }]).duplicate?.id).toBe(5) // same time, different formatting
    expect(v({ entryTime: '10:05' }, [saved]).duplicate).toBeNull() // different time = different trade
    expect(v({ qty: 11 }, [saved]).duplicate).toBeNull()
    expect(v({ exitPrice: 0 }, [saved]).duplicate).toBeNull() // incomplete form
  })
})
