import type { Settings, Trade, WeeklyReview } from './types'
import { DEFAULT_SETTINGS } from './defaults'
import { sanitizeRules } from './rulebook'

/** Fills in anything missing from older or partial settings with the defaults, section by section. */
export function normalizeSettings(s: Partial<Settings> | null | undefined): Settings {
  const x = (s ?? {}) as Partial<Settings>
  return {
    ...DEFAULT_SETTINGS, ...x,
    rates: { ...DEFAULT_SETTINGS.rates, ...x.rates },
    risk: { ...DEFAULT_SETTINGS.risk, ...x.risk },
    calculator: { ...DEFAULT_SETTINGS.calculator, ...x.calculator },
    goals: { ...DEFAULT_SETTINGS.goals, ...x.goals },
    cooldown: { ...DEFAULT_SETTINGS.cooldown, ...x.cooldown },
    rulebook: { rules: sanitizeRules(x.rulebook?.rules) },
    checklist: {
      items: Array.isArray(x.checklist?.items) ? x.checklist.items.filter((i): i is string => typeof i === 'string' && i.trim() !== '').map((i) => i.trim()) : DEFAULT_SETTINGS.checklist.items,
    },
  }
}

export interface ParsedBackup {
  trades: Trade[] // valid trades, without ids
  screenshotCount: number // images inside the file
  lite: boolean // the file was saved without screenshots on purpose
  reviews: WeeklyReview[]
  settings: Partial<Settings> | null
  invalid: number // trades in the file that were unusable and left out
}

const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const pos = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0

/** Reads a backup file's text. Throws a plain-English Error when it isn't a usable backup. */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error('This file is not a valid backup (it could not be read as JSON).') }
  const d = data as { trades?: unknown; reviews?: unknown; settings?: unknown }
  if (!d || typeof d !== 'object' || !Array.isArray(d.trades)) throw new Error('This file is not a trading-journal backup (it has no trades list).')

  const trades: Trade[] = []
  let invalid = 0
  for (const raw of d.trades as Record<string, unknown>[]) {
    const ok = raw && isDate(raw.date) && typeof raw.symbol === 'string' && raw.symbol.trim() && (raw.side === 'Long' || raw.side === 'Short') && pos(raw.qty) && pos(raw.entryPrice) && pos(raw.exitPrice)
    if (!ok) { invalid++; continue }
    const { id: _id, ...t } = raw as unknown as Trade
    trades.push({ ...t, symbol: t.symbol.trim().toUpperCase(), setup: t.setup ?? '', emotion: t.emotion ?? '', followedPlan: t.followedPlan ?? true, mistakes: Array.isArray(t.mistakes) ? t.mistakes : [], notes: t.notes ?? '' })
  }
  const reviews = (Array.isArray(d.reviews) ? d.reviews : [])
    .filter((r): r is WeeklyReview => !!r && isDate((r as WeeklyReview).weekStart))
    .map((r) => ({ weekStart: r.weekStart, wentWell: r.wentWell ?? '', improve: r.improve ?? '', focus: r.focus ?? '' }))
  const screenshotCount = trades.reduce((n, t) => n + (Array.isArray(t.screenshots) ? t.screenshots.length : 0), 0)
  return { trades, screenshotCount, lite: (data as { screenshots?: unknown }).screenshots === false, reviews, settings: d.settings && typeof d.settings === 'object' ? (d.settings as Partial<Settings>) : null, invalid }
}

/** Two trades are "the same" when these match. Time is normalised so 9:15 and 09:15 agree. */
export const tradeKey = (t: Trade) =>
  [t.date, t.symbol.trim().toUpperCase(), t.side, Number(t.qty), Number(t.entryPrice), Number(t.exitPrice), (t.entryTime ?? '').padStart(t.entryTime ? 5 : 0, '0')].join('|')

/**
 * Which incoming trades are not already in the journal. Counts copies, so if you really took the same trade twice
 * and the file has both, both are kept; only copies you already have are skipped.
 */
export function newTrades(existing: Trade[], incoming: Trade[]) {
  const have = new Map<string, number>()
  for (const t of existing) have.set(tradeKey(t), (have.get(tradeKey(t)) ?? 0) + 1)
  const add: Trade[] = []
  let skipped = 0
  for (const t of incoming) {
    const k = tradeKey(t)
    const n = have.get(k) ?? 0
    if (n > 0) { have.set(k, n - 1); skipped++ } else add.push(t)
  }
  return { add, skipped }
}

/** Weekly reviews: add weeks you don't have, and fill empty boxes in weeks you do. Anything you wrote is never overwritten. */
export function mergeReviews(existing: WeeklyReview[], incoming: WeeklyReview[]) {
  const byWeek = new Map(existing.map((r) => [r.weekStart, r]))
  const put: WeeklyReview[] = []
  let added = 0
  let filled = 0
  for (const r of incoming) {
    const e = byWeek.get(r.weekStart)
    if (!e) { if (r.wentWell.trim() || r.improve.trim() || r.focus.trim()) { put.push(r); added++ } continue }
    const merged = { ...e }
    let changed = false
    for (const k of ['wentWell', 'improve', 'focus'] as const) {
      if (!e[k].trim() && r[k].trim()) { merged[k] = r[k]; changed = true }
    }
    if (changed) { put.push(merged); filled++ }
  }
  return { put, added, filled }
}

const union = (a: string[], b: string[] | undefined) => [...a, ...(b ?? []).filter((x) => !a.includes(x))]

/** Settings when adding: yours stay as they are. Only things the file has and you lack are added (setups, tags, per-month amounts). */
export function mergeSettings(current: Settings, incoming: Partial<Settings> | null): Settings {
  if (!incoming) return current
  return {
    ...current,
    setups: union(current.setups, incoming.setups),
    mistakeTags: union(current.mistakeTags, incoming.mistakeTags),
    exitMistakes: union(current.exitMistakes, incoming.exitMistakes),
    monthCapital: { ...(incoming.monthCapital ?? {}), ...current.monthCapital },
    monthGoal: { ...(incoming.monthGoal ?? {}), ...current.monthGoal },
    monthMaxLoss: { ...(incoming.monthMaxLoss ?? {}), ...current.monthMaxLoss },
    // Rules from the file that you don't already have are added; the ones you have stay exactly as they are.
    rulebook: { rules: [...current.rulebook.rules, ...sanitizeRules(incoming.rulebook?.rules).filter((r) => !current.rulebook.rules.some((c) => c.id === r.id))] },
  }
}

/** The same trades with their screenshots removed (for a "lite" backup). */
export const stripScreenshots = (trades: Trade[]): Trade[] => trades.map(({ screenshots: _s, ...t }) => t)

/** How many screenshots there are and roughly how many bytes they add to a JSON backup (they are stored as text). */
export function screenshotStats(trades: Trade[]) {
  let images = 0
  let bytes = 0
  for (const t of trades) for (const s of t.screenshots ?? []) { images++; bytes += s.length }
  return { images, bytes }
}

/** 1536000 -> "1.5 MB", 40_000 -> "40 KB". */
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
