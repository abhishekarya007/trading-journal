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

import { formatBytes, screenshotStats, stripScreenshots } from './backupMerge'
describe('screenshots in backups', () => {
  const withShots = (n: number) => t({ screenshots: Array.from({ length: n }, () => 'data:image/jpeg;base64,' + 'A'.repeat(1000)) })
  it('strips screenshots without touching anything else, and without changing the originals', () => {
    const src = [withShots(2), t({ symbol: 'NOSHOT' })]
    const lite = stripScreenshots(src)
    expect(lite.every((x) => !('screenshots' in x))).toBe(true)
    expect(lite[0]).toMatchObject({ symbol: 'TCS', qty: 10, setup: 'Gap' })
    expect(src[0].screenshots).toHaveLength(2)
  })
  it('counts images and their size', () => {
    const s = screenshotStats([withShots(2), withShots(1), t()])
    expect(s.images).toBe(3)
    expect(s.bytes).toBe(3 * ('data:image/jpeg;base64,'.length + 1000))
    expect(screenshotStats([])).toEqual({ images: 0, bytes: 0 })
  })
  it('formats sizes plainly', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(40 * 1024)).toBe('40 KB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })
  it('parseBackup reports how many screenshots a file holds and whether it is a lite backup', () => {
    const full = parseBackup(JSON.stringify({ screenshots: true, trades: [withShots(2), t()] }))
    expect(full).toMatchObject({ screenshotCount: 2, lite: false })
    const lite = parseBackup(JSON.stringify({ screenshots: false, trades: stripScreenshots([withShots(2)]) }))
    expect(lite).toMatchObject({ screenshotCount: 0, lite: true })
    expect(parseBackup(JSON.stringify({ trades: [t()] }))).toMatchObject({ screenshotCount: 0, lite: false }) // older files: no flag
  })
})

describe('the rulebook in backups', () => {
  const rule = (id: string, n = 5) => ({ id, type: 'maxTrades' as const, enabled: true, params: { n } })
  it('travels inside the settings of a backup file', () => {
    const file = JSON.stringify({ trades: [], settings: { ...DEFAULT_SETTINGS, rulebook: { rules: [rule('a', 3)] } } })
    expect(normalizeSettings(parseBackup(file).settings).rulebook.rules).toEqual([rule('a', 3)])
  })
  it('adding a backup brings over the rules you do not have, and keeps yours as they are', () => {
    const mine = { ...DEFAULT_SETTINGS, rulebook: { rules: [rule('a', 9)] } }
    const merged = mergeSettings(mine, { rulebook: { rules: [rule('a', 3), rule('b', 4)] } })
    expect(merged.rulebook.rules.map((r) => [r.id, r.params.n])).toEqual([['a', 9], ['b', 4]])
    expect(mergeSettings(DEFAULT_SETTINGS, { rulebook: { rules: [rule('x')] } }).rulebook.rules).toHaveLength(1) // a fresh computer
  })
  it('ignores junk rules in a file', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { rulebook: { rules: [{ id: 'z', type: 'nonsense' }, null] as never } })
    expect(merged.rulebook.rules).toEqual([])
  })
})
