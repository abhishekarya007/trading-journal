import { describe, expect, it } from 'vitest'
import { advice, breakevenRR, breakevenWinRate, clampInput, DEFAULT_SIM, expectancyGrid, expectancyMoney, expectancyR, quantile, rng, simulate, type SimInput } from './simulator'

const base: SimInput = { ...DEFAULT_SIM, riskMode: 'fixed', risk: 1000, capital: 100000, charges: 0, variation: 0, runs: 200, trades: 50 }

describe('the maths', () => {
  it('expectancy in R', () => {
    expect(expectancyR(50, 1)).toBeCloseTo(0, 10) // coin flip, 1:1
    expect(expectancyR(40, 2)).toBeCloseTo(0.2, 10)
    expect(expectancyR(60, 1)).toBeCloseTo(0.2, 10)
    expect(expectancyR(30, 1)).toBeCloseTo(-0.4, 10)
  })
  it('break-even win rate and reward : risk are two sides of the same line', () => {
    expect(breakevenWinRate(1)).toBe(50)
    expect(breakevenWinRate(3)).toBe(25)
    expect(breakevenRR(50)).toBe(1)
    expect(breakevenRR(25)).toBe(3)
    expect(breakevenRR(0)).toBe(Infinity)
    for (const rr of [0.5, 1, 1.5, 2.5]) expect(expectancyR(breakevenWinRate(rr), rr)).toBeCloseTo(0, 10)
  })
  it('expectancy in rupees includes charges', () => {
    expect(expectancyMoney({ winRate: 60, rr: 1, charges: 0 }, 1000)).toBeCloseTo(200, 6)
    expect(expectancyMoney({ winRate: 60, rr: 1, charges: 50 }, 1000)).toBeCloseTo(150, 6)
  })
  it('advice says what is needed to cover charges as well', () => {
    const a = advice({ winRate: 50, rr: 1, charges: 100 }, 1000) // charges = 0.1R
    expect(a.profitable).toBe(false)
    expect(a.needWinRate).toBeGreaterThan(50)
    expect(a.needRR).toBeGreaterThan(1)
    expect(expectancyR(a.needWinRate, 1) - a.chargesR).toBeCloseTo(0, 8)
    expect(expectancyR(50, a.needRR) - a.chargesR).toBeCloseTo(0, 8)
    expect(advice({ winRate: 60, rr: 1.5, charges: 0 }, 1000).profitable).toBe(true)
  })
  it('the grid has a row for every reward : risk', () => {
    const g = expectancyGrid()
    expect(g.length).toBeGreaterThan(3)
    expect(g[0].length).toBeGreaterThan(5)
    expect(g.every((row) => row.every(Number.isFinite))).toBe(true)
  })
})

describe('random numbers and percentiles', () => {
  it('the same seed gives the same numbers, different seeds differ, and they stay in [0, 1)', () => {
    const a = rng(7), b = rng(7), c = rng(8)
    const xs = Array.from({ length: 5 }, () => a())
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()))
    expect(xs).not.toEqual(Array.from({ length: 5 }, () => c()))
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
  })
  it('quantiles', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([10], 0.9)).toBe(10)
    expect(quantile([], 0.5)).toBe(0)
  })
})

describe('simulate', () => {
  it('a 100% win rate makes exactly rr x risk on every trade', () => {
    const r = simulate({ ...base, winRate: 100, rr: 2 })
    expect(r.finals.every((f) => f === 100000 + 50 * 2000)).toBe(true)
    expect(r.summary.profitablePct).toBe(100)
    expect(r.summary.medianLossStreak).toBe(0)
    expect(r.summary.avgMaxDrawdownPct).toBe(0)
  })
  it('a 0% win rate loses the risk every trade, charges included, and never goes below zero', () => {
    const r = simulate({ ...base, winRate: 0, charges: 10 })
    expect(r.finals.every((f) => f === 100000 - 50 * 1010)).toBe(true)
    expect(r.summary.profitablePct).toBe(0)
    expect(r.summary.worstLossStreak).toBe(50)
    const wipe = simulate({ ...base, winRate: 0, risk: 30000, trades: 10 })
    expect(Math.min(...wipe.finals)).toBe(0)
    expect(wipe.summary.wipedOutPct).toBe(100)
  })
  it('repeats exactly with the same seed, and changes with a new one', () => {
    const a = simulate({ ...base, seed: 5 }), b = simulate({ ...base, seed: 5 }), c = simulate({ ...base, seed: 6 })
    expect(a.finals).toEqual(b.finals)
    expect(a.finals).not.toEqual(c.finals)
  })
  it('the average result matches the maths, within sampling noise', () => {
    const r = simulate({ ...base, winRate: 45, rr: 1.5, runs: 4000, trades: 40, seed: 3 }) // +0.125R x 1000 x 40 = +5000
    expect(r.summary.mean - 100000).toBeGreaterThan(5000 - 2500)
    expect(r.summary.mean - 100000).toBeLessThan(5000 + 2500)
    const losing = simulate({ ...base, winRate: 40, rr: 1, runs: 4000, trades: 40, seed: 3 }) // -0.2R
    expect(losing.summary.mean).toBeLessThan(100000)
    expect(losing.summary.profitablePct).toBeLessThan(50)
  })
  it('percent risk compounds: a losing run risks less each time, so it cannot reach zero', () => {
    const r = simulate({ ...base, riskMode: 'pct', risk: 10, winRate: 0, trades: 100 })
    expect(Math.min(...r.finals)).toBeGreaterThan(0)
  })
  it('bands, samples, histogram and drawdown levels are consistent', () => {
    const r = simulate({ ...base, trades: 30 })
    expect(r.bands).toHaveLength(31)
    expect(r.bands[0]).toEqual({ step: 0, p10: 100000, p50: 100000, p90: 100000 })
    expect(r.bands.every((b) => b.p10 <= b.p50 && b.p50 <= b.p90)).toBe(true)
    expect(r.samples).toHaveLength(30)
    expect(r.samples[0]).toHaveLength(31)
    expect(r.hist.reduce((s, h) => s + h.count, 0)).toBe(r.input.runs)
    const pcts = r.summary.ruin.map((x) => x.pct)
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts) // deeper drawdowns are rarer
    expect(r.summary.worst).toBeLessThanOrEqual(r.summary.p5)
    expect(r.summary.p95).toBeLessThanOrEqual(r.summary.best)
  })
  it('variation spreads the outcomes without changing the average much', () => {
    const flat = simulate({ ...base, winRate: 50, rr: 1.5, runs: 2000, seed: 2 })
    const wild = simulate({ ...base, winRate: 50, rr: 1.5, runs: 2000, seed: 2, variation: 0.5 })
    expect(wild.summary.p95 - wild.summary.p5).toBeGreaterThan(flat.summary.p95 - flat.summary.p5)
  })
  it('clamps silly input instead of freezing', () => {
    const c = clampInput({ ...base, trades: 99999, runs: 999999, winRate: 150, rr: -3, variation: 5 })
    expect(c.trades).toBe(1000)
    expect(c.runs * (c.trades + 1)).toBeLessThanOrEqual(3_000_000)
    expect(c.winRate).toBe(100)
    expect(c.rr).toBeGreaterThan(0)
    expect(c.variation).toBe(0.9)
    expect(simulate({ ...base, trades: 0, runs: 1 }).finals.length).toBeGreaterThan(0)
  })
})

import { exampleRun } from './simulator'
describe('exampleRun', () => {
  it('lists every trade, adds up the total, and repeats for the same seed', () => {
    const a = exampleRun({ ...base, trades: 20, winRate: 100, rr: 2 }, 1)
    expect(a.trades).toHaveLength(20)
    expect(a.total).toBe(20 * 2000)
    expect(a.wins).toBe(20)
    const x = exampleRun({ ...base, trades: 30 }, 4), y = exampleRun({ ...base, trades: 30 }, 4)
    expect(x).toEqual(y)
    expect(x.total).toBeCloseTo(x.trades.reduce((s, t) => s + t.amount, 0), 6)
    expect(exampleRun({ ...base, winRate: 0, trades: 7 }, 1).longestLosses).toBe(7)
  })
})

import { kellyPct } from './simulator'
describe('pro features', () => {
  it('kelly: no edge means 0, and the textbook case', () => {
    expect(kellyPct(50, 1)).toBe(0)
    expect(kellyPct(30, 1)).toBe(0)
    expect(kellyPct(60, 1)).toBeCloseTo(20, 6) // 0.6 - 0.4/1
    expect(kellyPct(40, 2)).toBeCloseTo(10, 6) // 0.4 - 0.6/2
  })
  it('stopping after losses in a day skips trades and caps the damage', () => {
    const loose = simulate({ ...base, winRate: 0, trades: 40, tradesPerDay: 10 })
    const strict = simulate({ ...base, winRate: 0, trades: 40, tradesPerDay: 10, stopAfterLosses: 2 })
    expect(loose.summary.skippedPct).toBe(0)
    expect(strict.summary.skippedPct).toBeCloseTo(80, 6) // 2 of every 10 trades taken
    expect(Math.min(...strict.finals)).toBe(100000 - 8 * 1000) // 4 days x 2 losses
    expect(Math.min(...loose.finals)).toBe(100000 - 40 * 1000)
  })
  it('a daily loss limit in R stops the day', () => {
    const r = simulate({ ...base, winRate: 0, trades: 20, tradesPerDay: 10, dailyLossR: 3 })
    expect(Math.min(...r.finals)).toBe(100000 - 6 * 1000) // 3 losses a day x 2 days
  })
  it('the goal probability counts runs that reached it', () => {
    expect(simulate({ ...base, winRate: 100, rr: 1, trades: 10, goal: 5000 }).summary.goalPct).toBe(100)
    expect(simulate({ ...base, winRate: 0, goal: 5000 }).summary.goalPct).toBe(0)
    expect(simulate({ ...base, goal: 0 }).summary.goalPct).toBeNull()
  })
})
