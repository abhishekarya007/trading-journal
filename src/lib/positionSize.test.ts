import { describe, it, expect } from 'vitest'
import { dailyLeft, outcomeAt, sizeForLoss } from './positionSize'
import { DEFAULT_SETTINGS } from './defaults'

const rates = DEFAULT_SETTINGS.rates
const base = { limit: 1000, entry: 100, stop: 98, side: 'Long' as const, rates }

describe('sizeForLoss', () => {
  it('finds the largest quantity whose total loss, charges included, fits the limit', () => {
    const s = sizeForLoss(base)!
    expect(s.loss).toBeLessThanOrEqual(1000)
    // one more share would break the limit
    const over = -outcomeAt('Long', 100, 98, s.qty + 1, rates).net
    expect(over).toBeGreaterThan(1000)
    // charges are real, so it is fewer shares than the bare price-move answer of 500
    expect(s.qty).toBeLessThan(500)
    expect(s.qty).toBeGreaterThan(450)
    expect(s.priceLoss).toBeCloseTo(s.qty * 2, 5)
    expect(s.loss).toBeCloseTo(s.priceLoss + s.atStop.charges.total, 1)
  })
  it('shows the charges that were included', () => {
    const c = sizeForLoss(base)!.atStop.charges
    expect(c.total).toBeGreaterThan(0)
    expect(c.brokerage).toBeGreaterThan(0)
    expect(c.stt).toBeGreaterThan(0)
  })
  it('works for shorts, and a bigger limit gives a bigger quantity', () => {
    const short = sizeForLoss({ ...base, side: 'Short', entry: 100, stop: 102 })!
    expect(short.wrongSide).toBe(false)
    expect(short.loss).toBeLessThanOrEqual(1000)
    expect(short.qty).toBeGreaterThan(450)
    expect(sizeForLoss({ ...base, limit: 2000 })!.qty).toBeGreaterThan(sizeForLoss(base)!.qty)
    expect(sizeForLoss({ ...base, limit: 500 })!.qty).toBeLessThan(sizeForLoss(base)!.qty)
  })
  it('suggests nothing when the stop-loss is on the wrong side or the limit is zero', () => {
    expect(sizeForLoss({ ...base, stop: 102 })).toMatchObject({ wrongSide: true, qty: 0, loss: 0 })
    expect(sizeForLoss({ ...base, side: 'Short', stop: 98 })).toMatchObject({ wrongSide: true, qty: 0 })
    expect(sizeForLoss({ ...base, limit: 0 })!.qty).toBe(0)
  })
  it('returns 0 when even one share would cost more than the limit', () => {
    expect(sizeForLoss({ ...base, limit: 10, entry: 100, stop: 50 })!.qty).toBe(0)
  })
  it('is null for unusable prices', () => {
    expect(sizeForLoss({ ...base, entry: 0 })).toBeNull()
    expect(sizeForLoss({ ...base, stop: 0 })).toBeNull()
    expect(sizeForLoss({ ...base, stop: 100 })).toBeNull()
  })
  it('adds the reward side when a target is given', () => {
    const s = sizeForLoss({ ...base, target: 106 })!
    expect(s.atTarget).not.toBeNull()
    expect(s.atTarget!.rewardPerShare).toBe(6)
    expect(s.atTarget!.priceRR).toBe(3)
    expect(s.atTarget!.net).toBeGreaterThan(0)
    // after charges the win is smaller than 3x the loss
    expect(s.atTarget!.netRR!).toBeLessThan(3)
    expect(s.atTarget!.netRR!).toBeGreaterThan(2.5)
    expect(sizeForLoss({ ...base, target: 95 })!.atTarget).toBeNull() // target on the wrong side
  })
  it('handles huge prices without breaking', () => {
    const s = sizeForLoss({ ...base, entry: 123456.5, stop: 122000, limit: 5000 })!
    expect(s.qty).toBeGreaterThanOrEqual(1)
    expect(s.loss).toBeLessThanOrEqual(5000)
  })
})

describe('dailyLeft', () => {
  it('is the limit minus today’s losses; profits do not add to it; no limit means null', () => {
    expect(dailyLeft(2000, -600)).toBe(1400)
    expect(dailyLeft(2000, 900)).toBe(2000)
    expect(dailyLeft(2000, -2500)).toBe(0)
    expect(dailyLeft(0, -100)).toBeNull()
  })
})

describe('never more than the money allows', () => {
  // risking 2000 on a 5-rupee stop at 500 would buy 400 shares = ₹2,00,000, but only ₹1,00,000 is available
  const tight = { limit: 2000, entry: 500, stop: 495, side: 'Long' as const, rates }
  it('without a cap, the risk limit alone decides (and can exceed capital)', () => {
    const s = sizeForLoss(tight)!
    expect(s.positionValue).toBeGreaterThan(100000)
    expect(s.cappedByCapital).toBe(false)
    expect(s.maxQty).toBeNull()
  })
  it('with a cap, the quantity is cut to what the money buys, and the loss gets smaller, not bigger', () => {
    const free = sizeForLoss(tight)!
    const s = sizeForLoss({ ...tight, maxValue: 100000 })!
    expect(s.qty).toBe(200)
    expect(s.positionValue).toBeLessThanOrEqual(100000)
    expect(s.cappedByCapital).toBe(true)
    expect(s.riskQty).toBe(free.qty)
    expect(s.loss).toBeLessThan(2000)
    expect(s.loss).toBeLessThan(free.loss)
  })
  it('leverage raises the cap', () => {
    expect(sizeForLoss({ ...tight, maxValue: 200000 })!.qty).toBeLessThanOrEqual(400)
    expect(sizeForLoss({ ...tight, maxValue: 200000 })!.qty).toBeGreaterThan(200)
  })
  it('a cap that is not reached changes nothing', () => {
    const loose = sizeForLoss({ ...base, maxValue: 1_000_000 })!
    expect(loose.cappedByCapital).toBe(false)
    expect(loose.qty).toBe(sizeForLoss(base)!.qty)
  })
  it('a price above the whole capital gives zero shares', () => {
    const s = sizeForLoss({ ...base, entry: 5000, stop: 4950, limit: 1000, maxValue: 3000 })!
    expect(s.qty).toBe(0)
    expect(s.maxQty).toBe(0)
  })
})
