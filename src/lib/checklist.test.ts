import { describe, expect, it } from 'vitest'
import { autoChecks, checklistWarnings } from './checklist'
import { calcTrade } from './calc'
import { DEFAULT_SETTINGS } from './defaults'
import { normalizeSettings } from './backupMerge'
import type { Trade } from './types'

const row = (exit: number, date = '2026-10-01') => {
  const trade: Trade = { id: Math.random(), date, symbol: 'A', side: 'Long', qty: 10, entryPrice: 100, exitPrice: exit, setup: 'Gap', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '' }
  return { trade, res: calcTrade(trade, DEFAULT_SETTINGS.rates) }
}

describe('autoChecks', () => {
  it('flags reached limits and a running cooldown', () => {
    const c = autoChecks([{ rule: 'loss', message: 'Daily loss limit hit' }], true)
    expect(c.map((x) => x.ok)).toEqual([false, false])
    expect(c[0].detail).toContain('Daily loss limit hit')
  })
  it('is all clear with no warnings and no cooldown', () => {
    expect(autoChecks([], false).every((x) => x.ok)).toBe(true)
  })
})

describe('checklistWarnings', () => {
  it('is quiet on a fresh day and warns once a risk rule is hit', () => {
    expect(checklistWarnings([], DEFAULT_SETTINGS, '2026-10-01')).toEqual([])
    const s = { ...DEFAULT_SETTINGS, risk: { ...DEFAULT_SETTINGS.risk, maxTradesPerDay: 1 } }
    expect(checklistWarnings([row(101)], s, '2026-10-01').map((w) => w.rule)).toContain('count')
  })
})

describe('checklist settings', () => {
  it('fills defaults for old settings and cleans bad items', () => {
    expect(normalizeSettings({}).checklist).toEqual(DEFAULT_SETTINGS.checklist)
    expect(normalizeSettings({ checklist: { items: [' A ', '', 3 as never, 'B'] } }).checklist).toEqual({ items: ['A', 'B'] })
  })
})
