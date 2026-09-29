import { describe, it, expect } from 'vitest'
import { duplicateTemplate, tradeSummary } from './tradeText'
import { calcTrade } from './calc'
import { DEFAULT_SETTINGS } from './defaults'
import type { Trade } from './types'

const t: Trade = {
  id: 7, date: '2026-09-01', symbol: 'TCS', side: 'Long', qty: 30, entryPrice: 137, exitPrice: 139.74,
  stopLoss: 135.63, target: 141.11, entryTime: '10:17', exitTime: '11:16', setup: 'Pullback', emotion: 'Calm',
  followedPlan: false, mistakes: ['FOMO'], notes: 'Chased it.', screenshots: ['data:image/jpeg;base64,xx'],
}

describe('duplicateTemplate', () => {
  it('keeps the plan but drops the outcome, journal and identity', () => {
    const d = duplicateTemplate(t, '2026-09-29')
    expect(d).toMatchObject({ date: '2026-09-29', symbol: 'TCS', side: 'Long', qty: 30, entryPrice: 137, stopLoss: 135.63, target: 141.11, setup: 'Pullback', exitPrice: 0 })
    expect(d.id).toBeUndefined()
    expect(d.entryTime).toBeUndefined()
    expect(d.exitTime).toBeUndefined()
    expect(d.mistakes).toEqual([])
    expect(d.notes).toBe('')
    expect(d.followedPlan).toBe(true)
    expect(d.screenshots).toBeUndefined()
    expect(t.mistakes).toEqual(['FOMO']) // source untouched
  })
})

describe('tradeSummary', () => {
  it('includes the key facts and skips empty parts', () => {
    const s = tradeSummary({ trade: t, res: calcTrade(t, DEFAULT_SETTINGS.rates) })
    expect(s).toContain('TCS LONG · 2026-09-01 10:17–11:16')
    expect(s).toContain('Entry 137 → Exit 139.74')
    expect(s).toContain('SL 135.63 · Target 141.11')
    expect(s).toContain('held 59m')
    expect(s).toContain('Broke plan')
    expect(s).toContain('Mistakes: FOMO')
    expect(s).toContain('Notes: Chased it.')
    const bare = tradeSummary({ trade: { ...t, stopLoss: undefined, target: undefined, mistakes: [], notes: '', entryTime: undefined, exitTime: undefined }, res: calcTrade(t, DEFAULT_SETTINGS.rates) })
    expect(bare).not.toContain('SL')
    expect(bare).not.toContain('Mistakes')
    expect(bare).not.toContain('Notes')
  })
})
