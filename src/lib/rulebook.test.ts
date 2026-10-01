import { describe, expect, it } from 'vitest'
import { checkAll, checkDraft, evalRule, newRule, rulebookStats, sanitizeRules, STARTER_RULES, weeklyAdherence, buildContexts, describeRule, CATALOG, type Rule, type RuleType } from './rulebook'
import { calcTrade } from './calc'
import { DEFAULT_SETTINGS } from './defaults'
import { normalizeSettings } from './backupMerge'
import type { Settings, Trade } from './types'

let id = 0
const mk = (over: Partial<Trade> = {}) => {
  const trade: Trade = { id: ++id, date: '2026-10-01', symbol: 'A', side: 'Long', qty: 10, entryPrice: 100, exitPrice: 102, stopLoss: 99, target: 103, entryTime: '10:00', exitTime: '10:30', setup: 'Breakout', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '', ...over }
  return { trade, res: calcTrade(trade, DEFAULT_SETTINGS.rates) }
}
const rule = (type: RuleType, params: Rule['params'] = {}): Rule => ({ ...newRule(type), params: { ...newRule(type).params, ...params } })
const withRules = (rules: Rule[]): Settings => ({ ...DEFAULT_SETTINGS, rulebook: { rules } })
const outcome = (r: Rule, over: Partial<Trade> = {}) => {
  const row = mk(over)
  return evalRule(r, row, buildContexts([row], DEFAULT_SETTINGS).get(row.trade)!)
}

describe('rules about the trade itself', () => {
  it('stop-loss and target', () => {
    expect(outcome(rule('stopLoss'))).toBe('pass')
    expect(outcome(rule('stopLoss'), { stopLoss: undefined })).toBe('fail')
    expect(outcome(rule('target'), { target: undefined })).toBe('fail')
  })
  it('risk : reward, n/a without a stop or target', () => {
    expect(outcome(rule('minRR', { rr: 2 }))).toBe('pass') // risk 1, reward 3
    expect(outcome(rule('minRR', { rr: 4 }))).toBe('fail')
    expect(outcome(rule('minRR', { rr: 2 }), { stopLoss: undefined })).toBe('na')
  })
  it('risk in rupees and as a share of capital', () => {
    expect(outcome(rule('maxRisk', { amount: 10 }))).toBe('pass') // 1 x 10
    expect(outcome(rule('maxRisk', { amount: 5 }))).toBe('fail')
    expect(outcome(rule('maxRisk', { amount: 5 }), { stopLoss: undefined })).toBe('na')
    expect(outcome(rule('maxRiskPct', { pct: 0.01 }))).toBe('pass') // 10 of 100000 = 0.01%
    expect(outcome(rule('maxRiskPct', { pct: 0.005 }))).toBe('fail')
  })
  it('cutting losses only judges losing trades that have a stop', () => {
    expect(outcome(rule('cutLosses', { r: 1.2 }), { exitPrice: 99 })).toBe('pass') // closed right at the stop, about 1R with charges
    expect(outcome(rule('cutLosses', { r: 1.2 }), { exitPrice: 97 })).toBe('fail') // 3R
    expect(outcome(rule('cutLosses', { r: 1.2 }), { exitPrice: 103 })).toBe('na') // a winner
    expect(outcome(rule('cutLosses', { r: 1.2 }), { exitPrice: 97, stopLoss: undefined })).toBe('na')
  })
})

describe('timing rules', () => {
  it('no early entries, no late entries, hold time', () => {
    expect(outcome(rule('noEarly', { n: 15 }), { entryTime: '9:20' })).toBe('fail') // before 9:30
    expect(outcome(rule('noEarly', { n: 15 }), { entryTime: '9:30' })).toBe('pass')
    expect(outcome(rule('noEarly', { n: 15 }), { entryTime: undefined })).toBe('na')
    expect(outcome(rule('noLate', { time: '14:30' }), { entryTime: '14:31' })).toBe('fail')
    expect(outcome(rule('noLate', { time: '14:30' }), { entryTime: '14:30' })).toBe('pass')
    expect(outcome(rule('maxHold', { n: 20 }))).toBe('fail') // 30 min
    expect(outcome(rule('maxHold', { n: 45 }))).toBe('pass')
    expect(outcome(rule('maxHold', { n: 45 }), { exitTime: undefined })).toBe('na')
  })
})

describe('behaviour rules', () => {
  it('setups, mistakes, plan, emotion, screenshot', () => {
    expect(outcome(rule('setups', { list: ['Breakout'] }))).toBe('pass')
    expect(outcome(rule('setups', { list: ['Gap'] }))).toBe('fail')
    expect(outcome(rule('setups', { list: [] }))).toBe('na')
    expect(outcome(rule('noMistakes'), { mistakes: ['FOMO'] })).toBe('fail')
    expect(outcome(rule('followedPlan'), { followedPlan: false })).toBe('fail')
    expect(outcome(rule('calm'), { emotion: 'Greedy' })).toBe('fail')
    expect(outcome(rule('calm'), { emotion: 'Confident' })).toBe('pass')
    expect(outcome(rule('screenshot'), { screenshots: ['x'] })).toBe('pass')
    expect(outcome(rule('screenshot'))).toBe('fail')
  })
})

describe('day rules fail the trades that went past the line', () => {
  const day = (...nets: number[]) => nets.map((n, i) => mk({ symbol: `T${i + 1}`, entryTime: `${10 + i}:00`, exitTime: `${10 + i}:20`, exitPrice: 100 + n / 10 }))
  const out = (rules: Rule[], rows: ReturnType<typeof mk>[]) => {
    const c = checkAll(rows, withRules(rules))
    return rows.map((r) => c.get(r.trade)!.results.map((x) => x.outcome))
  }
  it('max trades a day', () => {
    expect(out([rule('maxTrades', { n: 2 })], day(5, 5, 5, 5)).flat()).toEqual(['pass', 'pass', 'fail', 'fail'])
  })
  it('stop after a daily loss', () => {
    // the 1st loses 100, so by the 2nd trade the day is at the limit; the 2nd and 3rd are taken after it
    expect(out([rule('dailyLoss', { amount: 100 })], day(-100, -10, 5)).flat()).toEqual(['pass', 'fail', 'fail'])
    // a day that has climbed back above the limit is allowed to continue
    expect(out([rule('dailyLoss', { amount: 100 })], day(-100, 50, 5)).flat()).toEqual(['pass', 'fail', 'pass'])
  })
  it('stop after losses in a row, a win resets the run', () => {
    expect(out([rule('stopAfterLosses', { n: 2 })], day(-20, -20, 30, -20)).flat()).toEqual(['pass', 'pass', 'fail', 'pass'])
    expect(out([rule('stopAfterLosses', { n: 2 })], day(-20, 30, -20, -20, 30)).flat()).toEqual(['pass', 'pass', 'pass', 'pass', 'fail'])
  })
  it('wait after a loss, n/a when the last trade did not lose or times are missing', () => {
    const a = mk({ entryTime: '10:00', exitTime: '10:10', exitPrice: 90, symbol: 'L' })
    const b = mk({ entryTime: '10:15', exitTime: '10:25', symbol: 'B' }) // 5 min after the loss
    const c = mk({ entryTime: '11:00', exitTime: '11:10', symbol: 'C' }) // previous (b) was a win
    const checks = checkAll([a, b, c], withRules([rule('waitAfterLoss', { n: 10 })]))
    expect([a, b, c].map((r) => checks.get(r.trade)!.results[0].outcome)).toEqual(['na', 'fail', 'na'])
  })
  it('days are independent', () => {
    const rows = [mk({ date: '2026-10-01' }), mk({ date: '2026-10-01' }), mk({ date: '2026-10-02' })]
    const c = checkAll(rows, withRules([rule('maxTrades', { n: 1 })]))
    expect(rows.map((r) => c.get(r.trade)!.results[0].outcome)).toEqual(['pass', 'fail', 'pass'])
  })
})

describe('scoring', () => {
  const rules = [rule('stopLoss'), rule('noMistakes')]
  const rows = [
    mk({ symbol: 'GOOD', date: '2026-09-28' }),
    mk({ symbol: 'NOSL', stopLoss: undefined, date: '2026-09-29', exitPrice: 90 }),
    mk({ symbol: 'MIST', mistakes: ['FOMO'], date: '2026-10-01' }),
    mk({ symbol: 'GOOD2', date: '2026-10-02' }),
  ]
  const settings = withRules(rules)
  const checks = checkAll(rows, settings)
  const stats = rulebookStats(rows, checks, settings)
  it('adherence counts every judged rule check', () => {
    expect(stats.adherence).toBeCloseTo((2 + 1 + 1 + 2) / 8 * 100 - 0, 5) // GOOD 2/2, NOSL 1/2, MIST 1/2, GOOD2 2/2 = 6/8
    expect(stats.adherence).toBeCloseTo(75, 5)
    expect(stats.trades).toBe(4)
    expect(stats.cleanTrades).toBe(2)
    expect(stats.cleanPct).toBeCloseTo(50, 5)
  })
  it('the clean streak is the latest run of fully clean trades', () => {
    expect(stats.cleanStreak).toBe(1) // GOOD2, then MIST broke a rule
  })
  it('per-rule stats show what breaking each rule cost', () => {
    const sl = stats.perRule[0]
    expect(sl.failed).toBe(1)
    expect(sl.failedNet).toBeLessThan(0) // the trade with no stop lost money
    expect(sl.followedPct).toBeCloseTo(75, 5)
  })
  it('weekly adherence groups by week, oldest first', () => {
    const w = weeklyAdherence(rows, checks)
    expect(w.map((x) => x.weekStart)).toEqual(['2026-09-28'])
    expect(w[0].trades).toBe(4)
  })
  it('switched-off rules are ignored and no rules means no checks', () => {
    const off = withRules(rules.map((r) => ({ ...r, enabled: false })))
    expect(checkAll(rows, off).size).toBe(0)
    expect(rulebookStats(rows, checkAll(rows, off), off).adherence).toBeNull()
  })
})

describe('checking a trade before it is saved', () => {
  it('counts the other trades of that day, and ignores the saved copy of the trade being edited', () => {
    const saved = [mk({ date: '2026-10-01' }), mk({ date: '2026-10-01' })]
    const s = withRules([rule('maxTrades', { n: 2 })])
    const draft: Trade = { ...mk({ date: '2026-10-01' }).trade, id: undefined }
    expect(checkDraft(draft, saved, s)!.failed).toBe(1) // would be the 3rd trade
    const editing = saved[1].trade
    expect(checkDraft({ ...editing }, saved, s)!.failed).toBe(0) // editing the 2nd one
  })
  it('returns null when nothing is filled in yet or there are no rules', () => {
    expect(checkDraft({ ...mk().trade, qty: 0 }, [], withRules([rule('stopLoss')]))).toBeNull()
    expect(checkDraft(mk().trade, [], DEFAULT_SETTINGS)).toBeNull()
  })
})

describe('storage', () => {
  it('describes every rule in plain words', () => {
    for (const d of CATALOG) expect(describeRule(newRule(d.type)).length).toBeGreaterThan(5)
    expect(describeRule(rule('maxTrades', { n: 4 }))).toBe('No more than 4 trades a day')
    expect(describeRule(rule('noLate', { time: '14:30' }))).toBe('No new entries after 2:30 PM')
  })
  it('cleans rules from a file: unknown types, duplicate ids, junk parameters', () => {
    const r = sanitizeRules([
      { id: 'a', type: 'maxTrades', enabled: false, params: { n: 'abc' } },
      { id: 'a', type: 'stopLoss', params: {} },
      { id: 'b', type: 'nonsense', params: {} },
      { id: 'c', type: 'setups', params: { list: ['Gap', 5] } },
      { id: 'd', type: 'noLate', params: { time: '25' } },
      null,
    ])
    expect(r.map((x) => x.id)).toEqual(['a', 'c', 'd'])
    expect(r[0]).toMatchObject({ enabled: false, params: { n: 5 } }) // junk falls back to the default
    expect(r[1].params.list).toEqual(['Gap'])
    expect(r[2].params.time).toBe('14:30')
    expect(sanitizeRules('nope')).toEqual([])
  })
  it('settings default to an empty rulebook and keep valid rules', () => {
    expect(normalizeSettings({}).rulebook.rules).toEqual([])
    const s = normalizeSettings({ rulebook: { rules: STARTER_RULES() } })
    expect(s.rulebook.rules).toHaveLength(5)
  })
})
