import { describe, it, expect } from 'vitest'
import { calcTrade } from './calc'
import { DEFAULT_SETTINGS } from './defaults'
import type { Trade } from './types'

const base: Trade = {
  date: '2026-09-01', symbol: 'RELIANCE', side: 'Long', qty: 100,
  entryPrice: 1000, exitPrice: 1010, stopLoss: 995, setup: 'Breakout', emotion: 'Calm',
  followedPlan: true, mistakes: [], notes: '',
}
const rates = DEFAULT_SETTINGS.rates

describe('calcTrade', () => {
  it('intraday long: brokerage capped at 0.03% of order value', () => {
    // buy 1,00,000 -> min(20, 30)=20 ; sell 1,01,000 -> min(20, 30.3)=20
    const r = calcTrade(base, rates)
    expect(r.gross).toBe(1000)
    expect(r.charges.brokerage).toBe(40)
    expect(r.charges.stt).toBe(25.25) // 0.025% of 1,01,000
    expect(r.charges.stamp).toBe(3) // 0.003% of 1,00,000
    expect(r.net).toBeCloseTo(r.gross - r.charges.total, 2)
    expect(r.rMultiple).toBeCloseTo(r.net / 500, 1)
  })

  it('small intraday order uses 0.03% when below flat cap', () => {
    const r = calcTrade({ ...base, qty: 10 }, rates) // buy 10,000 -> 3 ; sell 10,100 -> 3.03
    expect(r.charges.brokerage).toBeCloseTo(6.03, 2)
  })

  it('intraday short: profit when price falls; STT on sell (entry) side', () => {
    const r = calcTrade({ ...base, side: 'Short', entryPrice: 1010, exitPrice: 1000, stopLoss: 1015 }, rates)
    expect(r.gross).toBe(1000)
    expect(r.charges.stt).toBe(25.25) // sell turnover = 1,01,000
  })
})
