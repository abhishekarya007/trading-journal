import { describe, it, expect } from 'vitest'
import { afterBadDay, bestWorstDays, confidence, dayList, hhmm, noteWords, searchNotes, snippet } from './habits'
import type { Row } from './stats'
import type { Trade } from './types'

let id = 0
const row = (date: string, net: number, t: Partial<Trade> = {}): Row => ({
  trade: { id: ++id, date, symbol: 'ABC', side: 'Long', qty: 10, entryPrice: 100, exitPrice: 100, setup: 'Breakout', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '', ...t },
  res: { net, rMultiple: null, gross: net, charges: { total: 0 } as never, returnPct: 0 },
})
const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}`

describe('dayList', () => {
  it('groups trades per day, oldest first', () => {
    const d = dayList([row(day(2), 10), row(day(1), -5), row(day(2), 20)])
    expect(d.map((x) => x.date)).toEqual([day(1), day(2)])
    expect(d[1]).toMatchObject({ net: 30, count: 2 })
  })
})

describe('bestWorstDays', () => {
  it('needs at least 6 trading days', () => {
    expect(bestWorstDays([row(day(1), 10), row(day(2), 5)])).toEqual({ enough: false, days: 2 })
  })
  it('splits best and worst days and explains what differs', () => {
    // 3 good days: 1 trade each, plan followed. 3 bad days: 4 trades each, plan broken, mistakes, early start.
    const rows = [
      ...[1, 2, 3].map((n) => row(day(n), 300, { entryTime: '10:30' })),
      ...[4, 5, 6].flatMap((n) => [1, 2, 3, 4].map(() => row(day(n), -100, { followedPlan: false, mistakes: ['FOMO'], entryTime: '09:20', emotion: 'Anxious' }))),
    ]
    const r = bestWorstDays(rows)
    if (!r.enough) throw new Error('expected enough')
    expect(r.k).toBe(3)
    expect(r.best.days.every((d) => d.net === 300)).toBe(true)
    expect(r.worst.days.every((d) => d.net === -400)).toBe(true)
    expect(r.worst.profile.tradesPerDay).toBe(4)
    const text = r.findings.join(' | ')
    expect(text).toContain('worst days have more trades')
    expect(text).toContain('follow your plan on 100% of trades on best days but only 0%')
    expect(text).toContain('worst days carry a mistake tag') // wording check below
  })
})

describe('afterBadDay', () => {
  it('compares the day after a loss with the day after a win', () => {
    // pattern: lose, then a big bad day; win, then a good day
    const rows = [
      row(day(1), -100), row(day(2), -300), row(day(2), -100), // day2 after loss (bad, 2 trades)
      row(day(3), 200), // day3 after loss (good)
      row(day(4), 100), // after win (good)
      row(day(5), -50), // after win
      row(day(6), -50), // after loss
      row(day(7), 500), row(day(8), 100), row(day(9), 100),
    ]
    const r = afterBadDay(rows)
    expect(r.afterLoss.days).toBeGreaterThanOrEqual(3)
    expect(r.afterWin.days).toBeGreaterThanOrEqual(3)
    expect(r.enough).toBe(true)
    expect(r.findings.length).toBeGreaterThan(0)
  })
  it('asks for more data when either group is small', () => {
    const r = afterBadDay([row(day(1), -10), row(day(2), 10)])
    expect(r.enough).toBe(false)
    expect(r.findings[0]).toContain('Need at least 3')
  })
  it('counts a day after two losing days', () => {
    const r = afterBadDay([row(day(1), -1), row(day(2), -1), row(day(3), 5)])
    expect(r.afterTwoLosses.days).toBe(1)
    expect(r.afterLoss.days).toBe(2)
  })
})

describe('confidence', () => {
  it('reports no data, unrated trades, and needs enough per group', () => {
    expect(confidence([row(day(1), 10)]).verdict).toContain('Rate your confidence')
    const some = confidence([row(day(1), 10, { confidence: 5 }), row(day(1), 10)])
    expect(some).toMatchObject({ rated: 1, unrated: 1 })
    expect(some.verdict).toContain('Need at least 3')
  })
  it('spots reliable and unreliable gut feel', () => {
    const good = confidence([...[1, 2, 3].map(() => row(day(1), 100, { confidence: 5 })), ...[1, 2, 3].map(() => row(day(1), -50, { confidence: 1 }))])
    expect(good.verdict).toContain('decent guide')
    const bad = confidence([...[1, 2, 3].map(() => row(day(1), -100, { confidence: 5 })), ...[1, 2, 3].map(() => row(day(1), 50, { confidence: 2 }))])
    expect(bad.verdict).toContain('do worse')
    expect(bad.levels.find((l) => l.level === 5)).toMatchObject({ count: 3, avgNet: -100 })
  })
})

describe('notes', () => {
  const rows = [
    row(day(1), -100, { notes: 'Chased the entry, should have waited' }),
    row(day(2), -80, { notes: 'chased it again' }),
    row(day(3), 150, { notes: 'Waited for the pullback' }),
    row(day(4), 20, { notes: '' }),
  ]
  it('finds recurring words and phrases with their P&L', () => {
    const w = noteWords(rows)
    const chased = w.find((x) => x.phrase === 'chased')!
    expect(chased).toMatchObject({ count: 2, net: -180, winRate: 0 })
    expect(w.find((x) => x.phrase === 'trade')).toBeUndefined() // stop word
    expect(w.every((x) => x.count >= 2)).toBe(true)
  })
  it('searches notes case-insensitively and summarises the matches', () => {
    const s = searchNotes(rows, 'CHASED')
    expect(s.matches).toHaveLength(2)
    expect(s.matches[0].trade.date).toBe(day(2)) // newest first
    expect(s.summary!.net).toBe(-180)
    expect(searchNotes(rows, '  ').matches).toEqual([])
    expect(searchNotes(rows, 'zzz').summary).toBeNull()
  })
  it('builds a highlight snippet', () => {
    const sn = snippet('Chased the entry, should have waited for a clean pullback', 'should have', 10, 12)
    expect(sn.hit).toBe('should have')
    expect(sn.pre.startsWith('…')).toBe(true)
    expect(sn.post.endsWith('…')).toBe(true)
  })
})

describe('hhmm', () => {
  it('rounds the total so minutes never read 60', () => {
    expect(hhmm(10 * 60 + 59.6)).toBe('11:00')
    expect(hhmm(9 * 60 + 15)).toBe('09:15')
    expect(hhmm(10 * 60 + 26.4)).toBe('10:26')
  })
})

describe('noteWords de-duplication', () => {
  it('merges phrases that occur in exactly the same trades into one', () => {
    const same = (n: number) => row(day(n), -50, { notes: 'Chased the entry, should have waited' })
    const w = noteWords([same(1), same(2), same(3)])
    expect(w).toHaveLength(1) // every word/phrase covers the same 3 trades
    expect(w[0]).toMatchObject({ count: 3, net: -150 })
    expect(w[0].phrase.includes(' ')).toBe(false) // prefers a single word
  })
  it('keeps distinct phrases that cover different trades', () => {
    const w = noteWords([
      row(day(1), -10, { notes: 'chased breakout' }), row(day(2), -10, { notes: 'chased reversal' }),
      row(day(3), 10, { notes: 'patient pullback' }), row(day(4), 10, { notes: 'patient reversal' }),
    ])
    expect(w.map((x) => x.phrase).sort()).toEqual(['chased', 'patient', 'reversal'])
  })
})
