import type { Settings, Trade } from './types'
import type { Row } from './stats'
import { calcTrade } from './calc'
import { chronological, holdMinutes } from './insights'
import { monthlyCapital } from './capital'
import { inr, time12 } from './format'
import { weekStart } from './week'

/**
 * The rulebook: rules you write once, and the app checks every trade against them from the data it already has.
 * Every rule is judged per trade as pass, fail, or n/a (the trade doesn't have what the rule needs, e.g. no stop-loss to measure risk).
 * Day rules ("max 5 trades a day") fail the trades that went past the line.
 */

export type RuleType =
  | 'stopLoss' | 'target' | 'minRR' | 'maxRisk' | 'maxRiskPct' | 'cutLosses'
  | 'maxTrades' | 'dailyLoss' | 'stopAfterLosses' | 'waitAfterLoss'
  | 'noEarly' | 'noLate' | 'maxHold'
  | 'setups' | 'noMistakes' | 'followedPlan' | 'calm' | 'screenshot'

export type ParamValue = number | string | string[]
export interface Rule { id: string; type: RuleType; enabled: boolean; params: Record<string, ParamValue> }
export type Outcome = 'pass' | 'fail' | 'na'

export interface Field { key: string; label: string; kind: 'number' | 'time' | 'setups'; min?: number; step?: number; prefix?: string; suffix?: string }
export interface RuleDef {
  type: RuleType
  group: 'Every trade' | 'Each day' | 'Timing' | 'Behaviour'
  hint: string // one line shown when choosing a rule
  fields: Field[]
  defaults: Record<string, ParamValue>
  sentence: (p: Record<string, ParamValue>) => string
}

const num = (p: Record<string, ParamValue>, k: string) => Number(p[k]) || 0
const OPEN = 9 * 60 + 15 // NSE opens at 9:15

export const CATALOG: RuleDef[] = [
  { type: 'stopLoss', group: 'Every trade', hint: 'A stop-loss is always filled in.', fields: [], defaults: {}, sentence: () => 'Always set a stop-loss' },
  { type: 'target', group: 'Every trade', hint: 'A target is always filled in.', fields: [], defaults: {}, sentence: () => 'Always set a target' },
  { type: 'minRR', group: 'Every trade', hint: 'The target is at least this many times the risk.', fields: [{ key: 'rr', label: 'Reward ÷ risk', kind: 'number', min: 0.1, step: 0.1, prefix: '1 :' }], defaults: { rr: 1.5 },
    sentence: (p) => `Risk : reward at least 1 : ${num(p, 'rr')}` },
  { type: 'maxRisk', group: 'Every trade', hint: 'Entry to stop-loss, times quantity, stays under an amount.', fields: [{ key: 'amount', label: 'Most to risk', kind: 'number', min: 1, step: 50, prefix: '₹' }], defaults: { amount: 1000 },
    sentence: (p) => `Risk no more than ${inr(num(p, 'amount'))} on a trade` },
  { type: 'maxRiskPct', group: 'Every trade', hint: 'Risk stays under a share of the month’s capital.', fields: [{ key: 'pct', label: 'Most to risk', kind: 'number', min: 0.05, step: 0.05, suffix: '% of capital' }], defaults: { pct: 1 },
    sentence: (p) => `Risk no more than ${num(p, 'pct')}% of the month’s capital on a trade` },
  { type: 'cutLosses', group: 'Every trade', hint: 'A losing trade is closed near its stop, not held far past it.', fields: [{ key: 'r', label: 'Worst loss', kind: 'number', min: 0.5, step: 0.1, suffix: 'R' }], defaults: { r: 1.2 },
    sentence: (p) => `Never let a loss run past ${num(p, 'r')}R` },

  { type: 'maxTrades', group: 'Each day', hint: 'Trades beyond this number in a day break the rule.', fields: [{ key: 'n', label: 'Trades a day', kind: 'number', min: 1, step: 1 }], defaults: { n: 5 },
    sentence: (p) => `No more than ${num(p, 'n')} trades a day` },
  { type: 'dailyLoss', group: 'Each day', hint: 'Trading after you have already lost this much that day breaks it.', fields: [{ key: 'amount', label: 'Daily loss', kind: 'number', min: 1, step: 100, prefix: '₹' }], defaults: { amount: 2000 },
    sentence: (p) => `Stop for the day after losing ${inr(num(p, 'amount'))}` },
  { type: 'stopAfterLosses', group: 'Each day', hint: 'Trading after this many losses in a row breaks it.', fields: [{ key: 'n', label: 'Losses in a row', kind: 'number', min: 1, step: 1 }], defaults: { n: 3 },
    sentence: (p) => `Stop for the day after ${num(p, 'n')} losses in a row` },
  { type: 'waitAfterLoss', group: 'Each day', hint: 'Needs entry and exit times. Re-entering too soon breaks it.', fields: [{ key: 'n', label: 'Minutes to wait', kind: 'number', min: 1, step: 5, suffix: 'min' }], defaults: { n: 10 },
    sentence: (p) => `Wait ${num(p, 'n')} minutes after a loss before the next trade` },

  { type: 'noEarly', group: 'Timing', hint: 'Needs an entry time. Skips the noisy opening.', fields: [{ key: 'n', label: 'Minutes after 9:15 AM', kind: 'number', min: 1, step: 5, suffix: 'min' }], defaults: { n: 15 },
    sentence: (p) => `No entries in the first ${num(p, 'n')} minutes after the open` },
  { type: 'noLate', group: 'Timing', hint: 'Needs an entry time. No new trades late in the session.', fields: [{ key: 'time', label: 'Last entry time', kind: 'time' }], defaults: { time: '14:30' },
    sentence: (p) => `No new entries after ${time12(String(p.time))}` },
  { type: 'maxHold', group: 'Timing', hint: 'Needs entry and exit times.', fields: [{ key: 'n', label: 'Longest hold', kind: 'number', min: 1, step: 5, suffix: 'min' }], defaults: { n: 90 },
    sentence: (p) => `Hold a trade no longer than ${num(p, 'n')} minutes` },

  { type: 'setups', group: 'Behaviour', hint: 'Only the setups you pick are allowed.', fields: [{ key: 'list', label: 'Allowed setups', kind: 'setups' }], defaults: { list: [] },
    sentence: (p) => `Only trade these setups: ${Array.isArray(p.list) && p.list.length ? p.list.join(', ') : 'none picked yet'}` },
  { type: 'noMistakes', group: 'Behaviour', hint: 'The trade has no mistake tags.', fields: [], defaults: {}, sentence: () => 'No mistake tags on a trade' },
  { type: 'followedPlan', group: 'Behaviour', hint: 'You ticked “I followed my plan”.', fields: [], defaults: {}, sentence: () => 'Follow my plan' },
  { type: 'calm', group: 'Behaviour', hint: 'Emotion is Calm or Confident.', fields: [], defaults: {}, sentence: () => 'Trade only when calm or confident' },
  { type: 'screenshot', group: 'Behaviour', hint: 'A chart screenshot is attached.', fields: [], defaults: {}, sentence: () => 'Attach a chart screenshot' },
]

export const defOf = (type: RuleType) => CATALOG.find((d) => d.type === type)!
export const describeRule = (r: Rule) => defOf(r.type).sentence(r.params)
export const newRule = (type: RuleType): Rule => ({ id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type, enabled: true, params: { ...defOf(type).defaults } })

/** A sensible first rulebook for someone starting out. */
export const STARTER_RULES = (): Rule[] => (['stopLoss', 'cutLosses', 'maxTrades', 'noMistakes', 'followedPlan'] as RuleType[]).map(newRule)

/** Cleans rules read from storage or a backup file: unknown types dropped, parameters coerced to safe values. */
export function sanitizeRules(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) return []
  const out: Rule[] = []
  const seen = new Set<string>()
  for (const x of raw as Partial<Rule>[]) {
    const def = CATALOG.find((d) => d.type === x?.type)
    if (!def || typeof x.id !== 'string' || seen.has(x.id)) continue
    seen.add(x.id)
    const params: Record<string, ParamValue> = { ...def.defaults }
    for (const f of def.fields) {
      const v = (x.params as Record<string, unknown> | undefined)?.[f.key]
      if (f.kind === 'number') { const n = Number(v); if (Number.isFinite(n) && n > 0) params[f.key] = n }
      else if (f.kind === 'time') { if (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v)) params[f.key] = v }
      else if (Array.isArray(v)) params[f.key] = v.filter((s): s is string => typeof s === 'string')
    }
    out.push({ id: x.id, type: def.type, enabled: x.enabled !== false, params })
  }
  return out
}

/* ---------- checking ---------- */

const mins = (t?: string) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m
}

/** What a trade needs to know about its day to be judged by day rules. */
export interface Ctx { order: number; netBefore: number; lossRunBefore: number; prevLossExit: number | null; capital: number }

export function buildContexts(rows: Row[], settings: Pick<Settings, 'startingCapital' | 'monthCapital' | 'goals' | 'monthGoal' | 'monthMaxLoss'>): Map<Trade, Ctx> {
  const out = new Map<Trade, Ctx>()
  const caps = monthlyCapital(rows, settings, (rows[rows.length - 1]?.trade.date ?? '').slice(0, 7))
  let day = ''
  let order = 0, net = 0, run = 0
  let prev: Row | null = null
  for (const r of chronological(rows)) {
    const t = r.trade
    if (t.date !== day) { day = t.date; order = 0; net = 0; run = 0; prev = null }
    order++
    out.set(t, {
      order, netBefore: net, lossRunBefore: run,
      prevLossExit: prev && prev.res.net < 0 ? mins(prev.trade.exitTime) : null,
      capital: caps.get(t.date.slice(0, 7))?.capital ?? settings.startingCapital,
    })
    net += r.res.net
    run = r.res.net < 0 ? run + 1 : r.res.net > 0 ? 0 : run
    prev = r
  }
  return out
}

export function evalRule(rule: Rule, row: Row, ctx: Ctx): Outcome {
  const t = row.trade
  const p = rule.params
  const ok = (b: boolean): Outcome => (b ? 'pass' : 'fail')
  const hasSL = !!t.stopLoss && t.stopLoss > 0
  const risk = hasSL ? Math.abs(t.entryPrice - t.stopLoss!) * t.qty : null
  switch (rule.type) {
    case 'stopLoss': return ok(hasSL)
    case 'target': return ok(!!t.target && t.target > 0)
    case 'minRR': {
      if (!hasSL || !t.target) return 'na'
      const rr = Math.abs(t.target - t.entryPrice) / Math.abs(t.entryPrice - t.stopLoss!)
      return ok(rr + 1e-9 >= num(p, 'rr'))
    }
    case 'maxRisk': return risk === null ? 'na' : ok(risk <= num(p, 'amount') * 1.005)
    case 'maxRiskPct': return risk === null || ctx.capital <= 0 ? 'na' : ok(risk <= (num(p, 'pct') / 100) * ctx.capital * 1.005)
    case 'cutLosses': {
      if (row.res.net >= 0 || row.res.rMultiple === null) return 'na'
      return ok(row.res.rMultiple >= -num(p, 'r') - 1e-9)
    }
    case 'maxTrades': return ok(ctx.order <= num(p, 'n'))
    case 'dailyLoss': return ok(ctx.netBefore > -num(p, 'amount'))
    case 'stopAfterLosses': return ok(ctx.lossRunBefore < num(p, 'n'))
    case 'waitAfterLoss': {
      const entry = mins(t.entryTime)
      if (ctx.prevLossExit === null || entry === null) return 'na'
      return ok(entry - ctx.prevLossExit >= num(p, 'n'))
    }
    case 'noEarly': { const m = mins(t.entryTime); return m === null ? 'na' : ok(m >= OPEN + num(p, 'n')) }
    case 'noLate': { const m = mins(t.entryTime); const limit = mins(String(p.time)); return m === null || limit === null ? 'na' : ok(m <= limit) }
    case 'maxHold': { const h = holdMinutes(t); return h === null ? 'na' : ok(h <= num(p, 'n')) }
    case 'setups': return Array.isArray(p.list) && p.list.length ? ok(p.list.includes(t.setup)) : 'na'
    case 'noMistakes': return ok(t.mistakes.length === 0)
    case 'followedPlan': return ok(t.followedPlan)
    case 'calm': return ok(t.emotion === 'Calm' || t.emotion === 'Confident')
    case 'screenshot': return ok(!!t.screenshots?.length)
  }
}

export interface TradeCheck {
  results: { rule: Rule; outcome: Outcome }[]
  passed: number
  failed: number
  score: number | null // % of judged rules followed; null when no rule could be judged
}

const summarizeResults = (results: TradeCheck['results']): TradeCheck => {
  const passed = results.filter((r) => r.outcome === 'pass').length
  const failed = results.filter((r) => r.outcome === 'fail').length
  return { results, passed, failed, score: passed + failed ? (passed / (passed + failed)) * 100 : null }
}

export const enabledRules = (settings: Pick<Settings, 'rulebook'>) => settings.rulebook.rules.filter((r) => r.enabled)

/** Every trade checked against every switched-on rule. */
export function checkAll(rows: Row[], settings: Settings): Map<Trade, TradeCheck> {
  const rules = enabledRules(settings)
  const out = new Map<Trade, TradeCheck>()
  if (!rules.length) return out
  const ctxs = buildContexts(rows, settings)
  for (const r of rows) {
    const ctx = ctxs.get(r.trade)!
    out.set(r.trade, summarizeResults(rules.map((rule) => ({ rule, outcome: evalRule(rule, r, ctx) }))))
  }
  return out
}

/** A trade that is still being typed into the form, checked as if it were saved (its day's other trades count). */
export function checkDraft(draft: Trade, rows: Row[], settings: Settings): TradeCheck | null {
  const rules = enabledRules(settings)
  if (!rules.length || !(draft.qty > 0 && draft.entryPrice > 0 && draft.exitPrice > 0)) return null
  const d: Trade = { ...draft, id: draft.id ?? Number.MAX_SAFE_INTEGER }
  const row: Row = { trade: d, res: calcTrade(d, settings.rates) }
  const others = rows.filter((r) => r.trade.id === undefined || r.trade.id !== draft.id)
  const ctx = buildContexts([...others, row], settings).get(d)!
  return summarizeResults(rules.map((rule) => ({ rule, outcome: evalRule(rule, row, ctx) })))
}

/* ---------- scoring ---------- */

export interface RuleStat {
  rule: Rule
  judged: number // trades the rule could be checked on
  passed: number
  failed: number
  followedPct: number | null
  failedNet: number // total P&L of the trades that broke it
  passedNet: number
}

export interface RulebookStats {
  adherence: number | null // % of all rule checks that passed
  trades: number // trades that could be judged by at least one rule
  cleanTrades: number // judged trades with no broken rule
  cleanPct: number | null
  cleanStreak: number // latest run of clean trades
  perRule: RuleStat[]
}

export function rulebookStats(rows: Row[], checks: Map<Trade, TradeCheck>, settings: Pick<Settings, 'rulebook'>): RulebookStats {
  const rules = enabledRules(settings)
  const perRule: RuleStat[] = rules.map((rule) => ({ rule, judged: 0, passed: 0, failed: 0, followedPct: null, failedNet: 0, passedNet: 0 }))
  let pass = 0, fail = 0, judgedTrades = 0, clean = 0
  for (const r of rows) {
    const c = checks.get(r.trade)
    if (!c) continue
    pass += c.passed; fail += c.failed
    if (c.passed + c.failed > 0) { judgedTrades++; if (c.failed === 0) clean++ }
    c.results.forEach((res, i) => {
      if (res.outcome === 'na') return
      const s = perRule[i]
      s.judged++
      if (res.outcome === 'pass') { s.passed++; s.passedNet += r.res.net } else { s.failed++; s.failedNet += r.res.net }
    })
  }
  for (const s of perRule) s.followedPct = s.judged ? (s.passed / s.judged) * 100 : null
  let streak = 0
  for (const r of [...chronological(rows)].reverse()) {
    const c = checks.get(r.trade)
    if (!c || c.passed + c.failed === 0) continue
    if (c.failed === 0) streak++
    else break
  }
  return {
    adherence: pass + fail ? (pass / (pass + fail)) * 100 : null,
    trades: judgedTrades, cleanTrades: clean, cleanPct: judgedTrades ? (clean / judgedTrades) * 100 : null,
    cleanStreak: streak, perRule,
  }
}

/** Rule adherence per week, oldest first, for the trend bars. */
export function weeklyAdherence(rows: Row[], checks: Map<Trade, TradeCheck>, last = 8): { weekStart: string; adherence: number; trades: number }[] {
  const by = new Map<string, { pass: number; fail: number; trades: number }>()
  for (const r of rows) {
    const c = checks.get(r.trade)
    if (!c || c.passed + c.failed === 0) continue
    const k = weekStart(r.trade.date)
    const e = by.get(k) ?? { pass: 0, fail: 0, trades: 0 }
    e.pass += c.passed; e.fail += c.failed; e.trades++
    by.set(k, e)
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-last).map(([k, e]) => ({ weekStart: k, adherence: (e.pass / (e.pass + e.fail)) * 100, trades: e.trades }))
}
