import { describe, it, expect } from 'vitest'
import { mergeReviews, mergeSettings, newTrades, normalizeSettings, parseBackup, tradeKey } from './backupMerge'
import { DEFAULT_SETTINGS } from './defaults'
import type { Trade, WeeklyReview } from './types'

const t = (o: Partial<Trade> = {}): Trade => ({ date: '2026-09-01', symbol: 'TCS', side: 'Long', qty: 10, entryPrice: 100, exitPrice: 101, setup: 'Gap', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '', ...o })
const rv = (weekStart: string, o: Partial<WeeklyReview> = {}): WeeklyReview => ({ weekStart, wentWell: '', improve: '', focus: '', ...o })

describe('parseBackup', () => {
  const file = (o: object) => JSON.stringify(o)
  it('reads trades, reviews and settings, drops ids and tidies fields', () => {
    const p = parseBackup(file({ version: 2, settings: { startingCapital: 5 }, trades: [{ ...t({ symbol: ' tcs ' }), id: 7 }], reviews: [rv('2026-08-31', { focus: 'x' })] }))
    expect(p.trades).toHaveLength(1)
    expect(p.trades[0].symbol).toBe('TCS')
    expect('id' in p.trades[0]).toBe(false)
    expect(p.reviews).toEqual([rv('2026-08-31', { focus: 'x' })])
    expect(p.settings).toEqual({ startingCapital: 5 })
    expect(p.invalid).toBe(0)
  })
  it('fills missing optional fields from older backups', () => {
    const p = parseBackup(file({ trades: [{ date: '2026-09-01', symbol: 'ABC', side: 'Short', qty: 5, entryPrice: 10, exitPrice: 9 }] }))
    expect(p.trades[0]).toMatchObject({ setup: '', emotion: '', followedPlan: true, mistakes: [], notes: '' })
    expect(p.reviews).toEqual([])
    expect(p.settings).toBeNull()
  })
  it('counts and skips unusable trades instead of failing the whole file', () => {
    const p = parseBackup(file({ trades: [t(), { symbol: 'X' }, { ...t(), qty: 0 }, { ...t(), side: 'Sideways' }, { ...t(), date: '1/2/2026' }, null] }))
    expect(p.trades).toHaveLength(1)
    expect(p.invalid).toBe(5)
  })
  it('explains what is wrong with files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(/could not be read/)
    expect(() => parseBackup('{"hello":1}')).toThrow(/no trades list/)
    expect(() => parseBackup('[1,2]')).toThrow(/no trades list/)
    expect(() => parseBackup('null')).toThrow(/no trades list/)
  })
})

describe('newTrades', () => {
  it('skips trades already in the journal and adds the rest', () => {
    const existing = [t(), t({ symbol: 'INFY' })]
    const incoming = [t(), t({ symbol: 'INFY' }), t({ symbol: 'SBIN' }), t({ date: '2026-09-02' })]
    const r = newTrades(existing, incoming)
    expect(r.skipped).toBe(2)
    expect(r.add.map((x) => `${x.symbol}${x.date}`)).toEqual(['SBIN2026-09-01', 'TCS2026-09-02'])
  })
  it('importing the same file again adds nothing', () => {
    const all = [t(), t({ symbol: 'A' }), t({ symbol: 'B', qty: 3 })]
    expect(newTrades(all, all)).toEqual({ add: [], skipped: 3 })
  })
  it('keeps genuine repeats: counts copies on both sides', () => {
    const twice = [t(), t()]
    expect(newTrades([t()], twice)).toMatchObject({ skipped: 1 }) // you had one, the file has two: add the second
    expect(newTrades([t()], twice).add).toHaveLength(1)
    expect(newTrades([], twice).add).toHaveLength(2)
    expect(newTrades(twice, [t()]).add).toHaveLength(0)
  })
  it('treats 9:15 and 09:15, and lower/upper-case symbols, as the same trade', () => {
    expect(tradeKey(t({ entryTime: '9:15' }))).toBe(tradeKey(t({ entryTime: '09:15' })))
    expect(tradeKey(t({ symbol: 'tcs' }))).toBe(tradeKey(t({ symbol: 'TCS' })))
    expect(tradeKey(t({ entryTime: '09:15' }))).not.toBe(tradeKey(t({ entryTime: '09:20' })))
    expect(tradeKey(t({ entryPrice: 100.5 }))).not.toBe(tradeKey(t()))
  })
})

describe('mergeReviews', () => {
  it('adds new weeks and fills only empty boxes, never overwriting what you wrote', () => {
    const existing = [rv('2026-09-07', { wentWell: 'mine', improve: '' })]
    const incoming = [rv('2026-09-07', { wentWell: 'theirs', improve: 'filled', focus: 'f' }), rv('2026-09-14', { focus: 'new week' }), rv('2026-09-21')]
    const r = mergeReviews(existing, incoming)
    expect(r.added).toBe(1) // the empty 09-21 review is ignored
    expect(r.filled).toBe(1)
    expect(r.put.find((x) => x.weekStart === '2026-09-07')).toEqual(rv('2026-09-07', { wentWell: 'mine', improve: 'filled', focus: 'f' }))
    expect(r.put.find((x) => x.weekStart === '2026-09-14')!.focus).toBe('new week')
  })
  it('does nothing when there is nothing to add', () => {
    expect(mergeReviews([rv('2026-09-07', { focus: 'a' })], [rv('2026-09-07', { focus: 'b' })])).toEqual({ put: [], added: 0, filled: 0 })
  })
})

describe('mergeSettings', () => {
  const cur = { ...DEFAULT_SETTINGS, setups: ['A', 'B'], mistakeTags: ['FOMO'], startingCapital: 999, monthCapital: { '2026-09': 1 } }
  it('keeps your settings and only adds what you lack', () => {
    const m = mergeSettings(cur, { startingCapital: 1, setups: ['B', 'C'], mistakeTags: ['Revenge'], monthCapital: { '2026-09': 50, '2026-08': 60 }, monthGoal: { '2026-08': 7 } })
    expect(m.startingCapital).toBe(999)
    expect(m.setups).toEqual(['A', 'B', 'C'])
    expect(m.mistakeTags).toEqual(['FOMO', 'Revenge'])
    expect(m.monthCapital).toEqual({ '2026-09': 1, '2026-08': 60 }) // yours wins for a month you set
    expect(m.monthGoal).toEqual({ '2026-08': 7 })
  })
  it('returns your settings untouched when the file has none', () => {
    expect(mergeSettings(cur, null)).toBe(cur)
  })
})

describe('normalizeSettings', () => {
  it('fills every missing section with defaults', () => {
    const s = normalizeSettings({ startingCapital: 5, risk: { dailyLossLimit: 1 } as never })
    expect(s.startingCapital).toBe(5)
    expect(s.risk.maxTradesPerDay).toBe(DEFAULT_SETTINGS.risk.maxTradesPerDay)
    expect(s.cooldown).toEqual(DEFAULT_SETTINGS.cooldown)
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
  })
})
