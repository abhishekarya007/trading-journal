import { describe, expect, it } from 'vitest'
import { savedOutcome } from './tradeEvents'
import { NOTES, VIBRATION } from './feedback'
import { calcTrade } from './calc'
import { DEFAULT_SETTINGS } from './defaults'
import type { Settings, Trade } from './types'

const trade = (exit: number, date = '2026-10-01'): Trade => ({ date, symbol: 'A', side: 'Long', qty: 100, entryPrice: 100, exitPrice: exit, setup: 'Gap', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '' })
const row = (t: Trade) => ({ trade: { ...t, id: Math.random() }, res: calcTrade(t, DEFAULT_SETTINGS.rates) })
const S = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over })

describe('savedOutcome', () => {
  it('classifies the trade and totals the day', () => {
    const o = savedOutcome([row(trade(105))], trade(90), S())
    expect(o.result).toBe('loss')
    expect(o.dayNet).toBeCloseTo(row(trade(105)).res.net + o.net, 6)
    expect(savedOutcome([], trade(110), S()).result).toBe('win')
    expect(savedOutcome([], trade(100.0), S()).result === 'loss' || savedOutcome([], trade(100.0), S()).result === 'flat').toBe(true)
  })
  it('reports only limits this trade crossed, not ones already crossed', () => {
    const s = S({ risk: { ...DEFAULT_SETTINGS.risk, maxTradesPerDay: 2, dailyLossLimit: 0, maxConsecutiveLosses: 0 } })
    expect(savedOutcome([row(trade(101))], trade(101), s).newWarnings.map((w) => w.rule)).toEqual(['count'])
    expect(savedOutcome([row(trade(101)), row(trade(101))], trade(101), s).newWarnings).toEqual([])
  })
  it('flags the trade that takes the month past its goal, once', () => {
    const s = S({ goals: { profit: 500, maxLoss: 0 } })
    const big = trade(110) // +~1000
    expect(savedOutcome([], big, s).goalReached).toBe(true)
    expect(savedOutcome([row(trade(110))], big, s).goalReached).toBe(false)
    expect(savedOutcome([], trade(100.5), s).goalReached).toBe(false)
  })
})

describe('sound definitions', () => {
  it('every kind has notes and a vibration, with positive frequencies', () => {
    for (const k of Object.keys(NOTES) as (keyof typeof NOTES)[]) {
      expect(NOTES[k].length).toBeGreaterThan(0)
      expect(NOTES[k].every((n) => n.f > 0 && n.dur > 0 && n.at >= 0)).toBe(true)
      expect(VIBRATION[k]).toBeTruthy()
    }
    expect(Object.keys(NOTES).sort()).toEqual(Object.keys(VIBRATION).sort())
  })
})
