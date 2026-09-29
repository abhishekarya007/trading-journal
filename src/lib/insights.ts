import type { Trade } from './types'
import { groupNet, summarize, type Row } from './stats'

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0)
const dir = (t: Trade) => (t.side === 'Long' ? 1 : -1)

const toMinutes = (t?: string) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m
}

/** Hold time in minutes; null when either time is missing or exit is before entry. */
export function holdMinutes(t: Trade): number | null {
  const a = toMinutes(t.entryTime)
  const b = toMinutes(t.exitTime)
  return a !== null && b !== null && b >= a ? b - a : null
}

/** Chronological order used for sequence-based analysis (tilt). */
export function chronological(rows: Row[]): Row[] {
  return [...rows].sort(
    (a, b) =>
      a.trade.date.localeCompare(b.trade.date) ||
      (a.trade.entryTime ?? '').localeCompare(b.trade.entryTime ?? '') ||
      (a.trade.id ?? 0) - (b.trade.id ?? 0),
  )
}

// 1. Time of day (by entry hour)
export function timeOfDay(rows: Row[]) {
  const timed = rows.filter((r) => r.trade.entryTime)
  return {
    data: groupNet(timed, (r) => [`${r.trade.entryTime!.slice(0, 2)}:00`]).sort((a, b) => a.name.localeCompare(b.name)),
    missing: rows.length - timed.length,
  }
}

// 2. Holding time
const HOLD_BUCKETS: [string, (m: number) => boolean][] = [
  ['<5m', (m) => m < 5],
  ['5–15m', (m) => m >= 5 && m < 15],
  ['15–60m', (m) => m >= 15 && m < 60],
  ['1–3h', (m) => m >= 60 && m < 180],
  ['>3h', (m) => m >= 180],
]
export function holding(rows: Row[]) {
  const held = rows.map((r) => ({ r, m: holdMinutes(r.trade) })).filter((x): x is { r: Row; m: number } => x.m !== null)
  const win = held.filter((x) => x.r.res.net > 0).map((x) => x.m)
  const loss = held.filter((x) => x.r.res.net < 0).map((x) => x.m)
  const buckets = HOLD_BUCKETS.map(([name, fn]) => {
    const inB = held.filter((x) => fn(x.m))
    return { name, net: Math.round(sum(inB.map((x) => x.r.res.net))), count: inB.length }
  }).filter((b) => b.count > 0)
  return { count: held.length, avgWinMin: avg(win), avgLossMin: avg(loss), buckets }
}

// 3. Cost of mistakes
export function mistakeCost(rows: Row[]) {
  const total = sum(rows.map((r) => r.res.net))
  const tags = [...new Set(rows.flatMap((r) => r.trade.mistakes))]
  // A trade with several mistakes belongs to several tags. "full" credits each tag with the whole trade
  // (rows overlap, so they don't add up); "split" divides the trade's P&L evenly across its tags (rows add up).
  const table = tags
    .map((tag) => {
      const w = rows.filter((r) => r.trade.mistakes.includes(tag))
      const fullNet = sum(w.map((r) => r.res.net))
      const splitNet = sum(w.map((r) => r.res.net / r.trade.mistakes.length))
      const solo = w.filter((r) => r.trade.mistakes.length === 1)
      return {
        tag,
        count: w.length,
        solo: { count: solo.length, net: sum(solo.map((r) => r.res.net)) },
        full: { net: fullNet, avgNet: fullNet / w.length, netWithout: total - fullNet },
        split: { net: splitNet, avgNet: splitNet / w.length, netWithout: total - splitNet },
      }
    })
    .sort((a, b) => a.split.net - b.split.net)
  const tagged = rows.filter((r) => r.trade.mistakes.length > 0)
  const multi = tagged.filter((r) => r.trade.mistakes.length > 1)
  const clean = rows.filter((r) => r.trade.mistakes.length === 0)
  return {
    table,
    tagged: { count: tagged.length, net: sum(tagged.map((r) => r.res.net)) },
    multi: { count: multi.length, net: sum(multi.map((r) => r.res.net)) },
    clean: { count: clean.length, net: sum(clean.map((r) => r.res.net)), avgNet: avg(clean.map((r) => r.res.net)) },
  }
}

// 4. Tilt: performance on the trade right after a loss vs after a win (same day)
export function tilt(rows: Row[]) {
  const seq = chronological(rows)
  const after: Record<'loss' | 'win', Row[]> = { loss: [], win: [] }
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1]
    if (prev.trade.date !== seq[i].trade.date || prev.res.net === 0) continue
    after[prev.res.net < 0 ? 'loss' : 'win'].push(seq[i])
  }
  const stat = (a: Row[]) => ({
    count: a.length,
    winRate: a.length ? (a.filter((r) => r.res.net > 0).length / a.length) * 100 : 0,
    avgNet: avg(a.map((r) => r.res.net)),
    avgSize: avg(a.map((r) => r.trade.entryPrice * r.trade.qty)),
  })
  return { afterLoss: stat(after.loss), afterWin: stat(after.win) }
}

// 5. Symbol leaderboard
export function symbolBoard(rows: Row[]) {
  const m = new Map<string, Row[]>()
  for (const r of rows) m.set(r.trade.symbol, [...(m.get(r.trade.symbol) ?? []), r])
  return [...m.entries()]
    .map(([symbol, rs]) => {
      const s = summarize(rs)
      return { symbol, count: s.count, net: s.net, winRate: s.winRate }
    })
    .sort((a, b) => b.net - a.net)
}

// 6. Setup scorecard, and 9. type/side splits share the same shape
export function scorecard(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, Row[]>()
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r])
  return [...m.entries()]
    .map(([name, rs]) => ({ name, ...summarize(rs) }))
    .sort((a, b) => b.net - a.net)
}

// 7. R-multiple distribution
const R_BUCKETS: [string, (r: number) => boolean][] = [
  ['< -2R', (r) => r < -2],
  ['-2 to -1R', (r) => r >= -2 && r < -1],
  ['-1 to 0R', (r) => r >= -1 && r < 0],
  ['0 to 1R', (r) => r >= 0 && r < 1],
  ['1 to 2R', (r) => r >= 1 && r < 2],
  ['2 to 3R', (r) => r >= 2 && r < 3],
  ['≥ 3R', (r) => r >= 3],
]
export function rHistogram(rows: Row[]) {
  const rs = rows.map((r) => r.res.rMultiple).filter((x): x is number => x !== null)
  return {
    data: R_BUCKETS.map(([name, fn]) => ({ name, count: rs.filter(fn).length, positive: name.startsWith('0') || name.startsWith('1') || name.startsWith('2') || name.startsWith('≥') })),
    total: rs.length,
    missing: rows.length - rs.length,
  }
}

// 8. Win/loss size and break-even win rate
export function payoff(rows: Row[]) {
  const s = summarize(rows)
  const ratio = s.avgLoss > 0 ? s.avgWin / s.avgLoss : null
  return {
    avgWin: s.avgWin,
    avgLoss: s.avgLoss,
    ratio,
    breakevenWinRate: ratio !== null ? 100 / (1 + ratio) : null,
    winRate: s.winRate,
  }
}

// 10. Overtrading: average day P&L by number of trades taken that day
const COUNT_BUCKETS: [string, (n: number) => boolean][] = [
  ['1 trade', (n) => n === 1],
  ['2 trades', (n) => n === 2],
  ['3 trades', (n) => n === 3],
  ['4–5 trades', (n) => n >= 4 && n <= 5],
  ['6+ trades', (n) => n >= 6],
]
export function overtrading(rows: Row[]) {
  const days = new Map<string, { n: number; net: number }>()
  for (const r of rows) {
    const d = days.get(r.trade.date) ?? { n: 0, net: 0 }
    d.n += 1
    d.net += r.res.net
    days.set(r.trade.date, d)
  }
  return COUNT_BUCKETS.map(([name, fn]) => {
    const ds = [...days.values()].filter((d) => fn(d.n))
    return { name, days: ds.length, avgDayNet: avg(ds.map((d) => d.net)), totalNet: sum(ds.map((d) => d.net)) }
  }).filter((b) => b.days > 0)
}

// 11. Stop-loss / target adherence (price-based R, ignores charges)
export function adherence(rows: Row[]) {
  let losersWithSl = 0, heldPast = 0, cutEarly = 0, asPlanned = 0, overshoot = 0
  let targetTrades = 0, hit = 0, exitedEarly = 0, leftR = 0, leftN = 0, lossWithTarget = 0
  const plannedRR: number[] = []

  for (const { trade: t } of rows) {
    const d = dir(t)
    const risk = t.stopLoss ? Math.abs(t.entryPrice - t.stopLoss) : 0
    const moveR = risk > 0 ? (d * (t.exitPrice - t.entryPrice)) / risk : null

    if (moveR !== null && moveR < 0) {
      losersWithSl++
      if (moveR < -1.05) { heldPast++; overshoot += -moveR - 1 }
      else if (moveR > -0.95) cutEarly++
      else asPlanned++
    }

    if (t.target && d * (t.target - t.entryPrice) > 0) {
      targetTrades++
      if (risk > 0) plannedRR.push(Math.abs(t.target - t.entryPrice) / risk)
      const profitable = d * (t.exitPrice - t.entryPrice) > 0
      if (d * (t.exitPrice - t.target) >= 0) hit++
      else if (profitable) {
        exitedEarly++
        if (risk > 0) { leftR += (d * (t.target - t.exitPrice)) / risk; leftN++ }
      } else lossWithTarget++
    }
  }
  return {
    losersWithSl, heldPast, cutEarly, asPlanned,
    avgOvershootR: heldPast ? overshoot / heldPast : 0,
    targetTrades, hit, exitedEarly, lossWithTarget,
    avgLeftR: leftN ? leftR / leftN : 0,
    avgPlannedRR: avg(plannedRR),
  }
}

// ---- Self-review insights ----------------------------------------------------------------------

const winRateOf = (a: Row[]) => (a.length ? (a.filter((r) => r.res.net > 0).length / a.length) * 100 : 0)
const median = (a: number[]) => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// A. Disciplined vs actual: what if every plan-breaking / mistake-tagged trade had been skipped?
export function discipline(rows: Row[]) {
  const isClean = (r: Row) => r.trade.followedPlan && r.trade.mistakes.length === 0
  const clean = rows.filter(isClean)
  const flawed = rows.filter((r) => !isClean(r))
  const stat = (a: Row[]) => ({ count: a.length, net: sum(a.map((r) => r.res.net)), winRate: winRateOf(a), expectancy: avg(a.map((r) => r.res.net)) })
  const actual = sum(rows.map((r) => r.res.net))
  const disciplined = sum(clean.map((r) => r.res.net))
  return {
    actual,
    disciplined,
    cost: disciplined - actual, // > 0: indiscipline cost you this much
    clean: stat(clean),
    flawed: stat(flawed),
    brokePlan: rows.filter((r) => !r.trade.followedPlan).length,
    mistaken: rows.filter((r) => r.trade.mistakes.length > 0).length,
  }
}

// B. Position size consistency. Size = entry price x quantity (money put into the trade).
export function sizing(rows: Row[], overFactor = 1.5) {
  const size = (r: Row) => r.trade.entryPrice * r.trade.qty
  const sizes = rows.map(size)
  const med = median(sizes)
  const mean = avg(sizes)
  const sd = Math.sqrt(avg(sizes.map((s) => (s - mean) ** 2)))
  const over = rows.filter((r) => med > 0 && size(r) > med * overFactor)
  const normal = rows.filter((r) => !(med > 0 && size(r) > med * overFactor))
  const stat = (a: Row[]) => ({ count: a.length, avgNet: avg(a.map((r) => r.res.net)), winRate: winRateOf(a) })

  // Size of each trade relative to the median, grouped by what happened just before it (same day).
  const seq = chronological(rows)
  const groups: Record<'afterWin' | 'afterLoss' | 'afterTwoLosses', number[]> = { afterWin: [], afterLoss: [], afterTwoLosses: [] }
  let lossStreak = 0
  for (let i = 0; i < seq.length; i++) {
    const sameDayPrev = i > 0 && seq[i - 1].trade.date === seq[i].trade.date
    if (!sameDayPrev) lossStreak = 0
    if (sameDayPrev && med > 0) {
      const prevNet = seq[i - 1].res.net
      const rel = size(seq[i]) / med
      if (prevNet > 0) groups.afterWin.push(rel)
      else if (prevNet < 0) {
        groups.afterLoss.push(rel)
        if (lossStreak >= 2) groups.afterTwoLosses.push(rel)
      }
    }
    const net = seq[i].res.net
    lossStreak = net < 0 ? lossStreak + 1 : net > 0 ? 0 : lossStreak
    // lossStreak now counts losses up to and including trade i
  }
  const rel = (a: number[]) => ({ count: a.length, ratio: avg(a) })
  return {
    count: rows.length,
    median: med,
    cv: mean > 0 ? sd / mean : 0, // coefficient of variation: 0 = identical sizes
    biggestRatio: med > 0 ? Math.max(0, ...sizes) / med : 0,
    overFactor,
    normal: stat(normal),
    oversized: stat(over),
    afterWin: rel(groups.afterWin),
    afterLoss: rel(groups.afterLoss),
    afterTwoLosses: rel(groups.afterTwoLosses),
  }
}

// C. Gap between finishing a trade and starting the next one (same day), by how the previous trade ended.
const GAP_BUCKETS: [string, (m: number) => boolean][] = [
  ['< 5 min', (m) => m < 5],
  ['5–15 min', (m) => m >= 5 && m < 15],
  ['15–60 min', (m) => m >= 15 && m < 60],
  ['> 1 hour', (m) => m >= 60],
]
export function reentry(rows: Row[]) {
  const seq = chronological(rows)
  const pairs: { gap: number; prevNet: number; net: number }[] = []
  let sameDayPairs = 0
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1], b = seq[i]
    if (a.trade.date !== b.trade.date || a.res.net === 0) continue
    sameDayPairs++
    const exit = toMinutes(a.trade.exitTime)
    const entry = toMinutes(b.trade.entryTime)
    if (exit === null || entry === null) continue
    pairs.push({ gap: Math.max(0, entry - exit), prevNet: a.res.net, net: b.res.net })
  }
  const table = (afterLoss: boolean) =>
    GAP_BUCKETS.map(([name, fn]) => {
      const p = pairs.filter((x) => (x.prevNet < 0) === afterLoss && fn(x.gap))
      return { name, count: p.length, winRate: p.length ? (p.filter((x) => x.net > 0).length / p.length) * 100 : 0, avgNet: avg(p.map((x) => x.net)), net: sum(p.map((x) => x.net)) }
    }).filter((b) => b.count > 0)
  const quick = pairs.filter((x) => x.prevNet < 0 && x.gap < 5)
  const slower = pairs.filter((x) => x.prevNet < 0 && x.gap >= 5)
  return {
    afterLoss: table(true),
    afterWin: table(false),
    quick: { count: quick.length, net: sum(quick.map((x) => x.net)), avgNet: avg(quick.map((x) => x.net)) },
    slower: { count: slower.length, avgNet: avg(slower.map((x) => x.net)) },
    measured: pairs.length,
    missing: sameDayPairs - pairs.length,
  }
}

/** What the disciplined-vs-actual numbers mean, covering all four combinations of clean/flawed being up or down. */
export function disciplineVerdict(d: ReturnType<typeof discipline>): { tone: 'good' | 'warn' | 'info'; text: string } {
  const money = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`
  if (d.flawed.count === 0) return { tone: 'good', text: 'Every trade followed your plan with no tagged mistakes.' }
  if (d.clean.count === 0) return { tone: 'info', text: `None of your ${d.flawed.count} trades were clean, so there is nothing to compare against yet.` }

  const cleanUp = d.clean.net >= 0
  const flawedUp = d.flawed.net >= 0
  const small = d.clean.count < 5 || d.flawed.count < 5
  const caveat = small ? ' The sample is small, so treat this as a hint, not a conclusion.' : ''

  if (cleanUp && !flawedUp)
    return { tone: 'warn', text: `Your planned trades made ${money(d.clean.net)}, while ${d.flawed.count} plan-breaking or mistaken trades lost ${money(d.flawed.net)}. Skipping those would have improved your P&L by ${money(d.cost)}.${caveat}` }
  if (!cleanUp && flawedUp)
    return { tone: 'info', text: `Your planned trades lost ${money(d.clean.net)}, while ${d.flawed.count} plan-breaking trades made ${money(d.flawed.net)}. Following the plan would NOT have helped here. This points at the plan itself (entries, stops, targets) more than at discipline. Don't read it as "break the rules": those wins add risk and are hard to repeat.${caveat}` }
  if (cleanUp && flawedUp)
    return { tone: 'info', text: `Both groups made money: planned trades ${money(d.clean.net)}, flawed trades ${money(d.flawed.net)}. Compare the average per trade and win rate below to see which is more reliable.${caveat}` }
  return { tone: 'warn', text: `Both groups lost: planned trades ${money(d.clean.net)}, flawed trades ${money(d.flawed.net)}. Skipping the flawed ones would have cut the loss by ${money(d.cost)}, but the plan on its own is not profitable yet.${caveat}` }
}
