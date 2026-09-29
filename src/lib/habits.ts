import type { Row } from './stats'
import { summarize } from './stats'

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0)
const money = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`
const toMin = (t?: string) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m
}
/** Minute-of-day to HH:MM, rounding the total first so 10:59.6 becomes 11:00, never 10:60. */
export const hhmm = (m: number) => {
  const t = Math.round(m)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
const mode = (a: string[]) => {
  const c = new Map<string, number>()
  for (const x of a) if (x) c.set(x, (c.get(x) ?? 0) + 1)
  const top = [...c.entries()].sort((x, y) => y[1] - x[1])[0]
  return top ? { name: top[0], count: top[1] } : null
}

export interface Day { date: string; net: number; count: number; rows: Row[] }

/** One entry per trading day, oldest first. */
export function dayList(rows: Row[]): Day[] {
  const m = new Map<string, Row[]>()
  for (const r of rows) m.set(r.trade.date, [...(m.get(r.trade.date) ?? []), r])
  return [...m.entries()]
    .map(([date, rs]) => ({ date, net: sum(rs.map((r) => r.res.net)), count: rs.length, rows: rs }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ---- Best vs worst days --------------------------------------------------------------------------

export interface DayProfile {
  days: number
  tradesPerDay: number
  winRate: number
  planRate: number // % of trades where the plan was followed
  mistakeRate: number // % of trades with any mistake tagged
  firstEntry: number | null // average minute-of-day of the first trade, when times exist
  topSetup: { name: string; count: number } | null
  topEmotion: { name: string; count: number } | null
  avgNet: number
}

function profile(days: Day[]): DayProfile {
  const rs = days.flatMap((d) => d.rows)
  const firsts = days
    .map((d) => Math.min(...d.rows.map((r) => toMin(r.trade.entryTime)).filter((x): x is number => x !== null)))
    .filter(Number.isFinite)
  return {
    days: days.length,
    tradesPerDay: avg(days.map((d) => d.count)),
    winRate: rs.length ? (rs.filter((r) => r.res.net > 0).length / rs.length) * 100 : 0,
    planRate: rs.length ? (rs.filter((r) => r.trade.followedPlan).length / rs.length) * 100 : 0,
    mistakeRate: rs.length ? (rs.filter((r) => r.trade.mistakes.length > 0).length / rs.length) * 100 : 0,
    firstEntry: firsts.length ? avg(firsts) : null,
    topSetup: mode(rs.map((r) => r.trade.setup)),
    topEmotion: mode(rs.map((r) => r.trade.emotion)),
    avgNet: avg(days.map((d) => d.net)),
  }
}

export function bestWorstDays(rows: Row[], maxN = 5) {
  const days = dayList(rows)
  if (days.length < 6) return { enough: false as const, days: days.length }
  const k = Math.min(maxN, Math.floor(days.length / 2))
  const byNet = [...days].sort((a, b) => b.net - a.net)
  const best = byNet.slice(0, k)
  const worst = byNet.slice(-k).reverse() // worst first
  const bp = profile(best)
  const wp = profile(worst)

  const findings: string[] = []
  if (wp.tradesPerDay >= bp.tradesPerDay * 1.3 && wp.tradesPerDay - bp.tradesPerDay >= 0.5)
    findings.push(`Your worst days have more trades (${wp.tradesPerDay.toFixed(1)} a day vs ${bp.tradesPerDay.toFixed(1)}): overtrading shows up on bad days.`)
  else if (bp.tradesPerDay >= wp.tradesPerDay * 1.3 && bp.tradesPerDay - wp.tradesPerDay >= 0.5)
    findings.push(`Your best days have more trades (${bp.tradesPerDay.toFixed(1)} a day vs ${wp.tradesPerDay.toFixed(1)}), so trading more isn't your problem.`)
  if (bp.planRate - wp.planRate >= 15)
    findings.push(`You follow your plan on ${Math.round(bp.planRate)}% of trades on best days but only ${Math.round(wp.planRate)}% on worst days.`)
  else if (wp.planRate - bp.planRate >= 15)
    findings.push(`You followed your plan more on worst days (${Math.round(wp.planRate)}% vs ${Math.round(bp.planRate)}%), so the plan itself may be the issue.`)
  if (wp.mistakeRate - bp.mistakeRate >= 15)
    findings.push(`${Math.round(wp.mistakeRate)}% of trades on worst days carry a mistake tag, against ${Math.round(bp.mistakeRate)}% on best days.`)
  if (bp.firstEntry !== null && wp.firstEntry !== null && Math.abs(bp.firstEntry - wp.firstEntry) >= 30)
    findings.push(wp.firstEntry < bp.firstEntry
      ? `You start earlier on your worst days (first trade around ${hhmm(wp.firstEntry)} vs ${hhmm(bp.firstEntry)}), possibly rushing the open.`
      : `You start later on your worst days (around ${hhmm(wp.firstEntry)} vs ${hhmm(bp.firstEntry)}).`)
  if (bp.topEmotion && wp.topEmotion && bp.topEmotion.name !== wp.topEmotion.name && bp.topEmotion.count >= 2 && wp.topEmotion.count >= 2)
    findings.push(`Best days are mostly "${bp.topEmotion.name}", worst days mostly "${wp.topEmotion.name}".`)
  if (bp.topSetup && wp.topSetup && bp.topSetup.name !== wp.topSetup.name && bp.topSetup.count >= 2 && wp.topSetup.count >= 2)
    findings.push(`Your main setup is ${bp.topSetup.name} on best days but ${wp.topSetup.name} on worst days.`)
  if (!findings.length) findings.push('No strong pattern separates your best and worst days yet.')

  const brief = (d: Day) => ({ date: d.date, net: d.net, count: d.count })
  return { enough: true as const, k, best: { days: best.map(brief), profile: bp }, worst: { days: worst.map(brief), profile: wp }, findings }
}

// ---- The day after a losing day ------------------------------------------------------------------

export interface FollowStats { days: number; tradesPerDay: number; winRate: number; avgNet: number; sizeRatio: number; planRate: number }

export function afterBadDay(rows: Row[]) {
  const days = dayList(rows)
  const sizes = rows.map((r) => r.trade.entryPrice * r.trade.qty).sort((a, b) => a - b)
  const med = sizes.length ? (sizes.length % 2 ? sizes[(sizes.length - 1) / 2] : (sizes[sizes.length / 2 - 1] + sizes[sizes.length / 2]) / 2) : 0
  const groups: Record<'afterLoss' | 'afterWin' | 'afterTwoLosses', Day[]> = { afterLoss: [], afterWin: [], afterTwoLosses: [] }
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]
    if (prev.net < 0) {
      groups.afterLoss.push(days[i])
      if (i >= 2 && days[i - 2].net < 0) groups.afterTwoLosses.push(days[i])
    } else if (prev.net > 0) groups.afterWin.push(days[i])
  }
  const stat = (ds: Day[]): FollowStats => {
    const rs = ds.flatMap((d) => d.rows)
    return {
      days: ds.length,
      tradesPerDay: avg(ds.map((d) => d.count)),
      winRate: rs.length ? (rs.filter((r) => r.res.net > 0).length / rs.length) * 100 : 0,
      avgNet: avg(ds.map((d) => d.net)),
      sizeRatio: med > 0 && rs.length ? avg(rs.map((r) => (r.trade.entryPrice * r.trade.qty) / med)) : 0,
      planRate: rs.length ? (rs.filter((r) => r.trade.followedPlan).length / rs.length) * 100 : 0,
    }
  }
  const afterLoss = stat(groups.afterLoss)
  const afterWin = stat(groups.afterWin)
  const afterTwoLosses = stat(groups.afterTwoLosses)

  const findings: string[] = []
  const enough = afterLoss.days >= 3 && afterWin.days >= 3
  if (enough) {
    if (afterLoss.avgNet < afterWin.avgNet)
      findings.push(`You do worse the day after a losing day: an average of ${afterLoss.avgNet < 0 ? '-' : ''}${money(afterLoss.avgNet)} vs ${afterWin.avgNet < 0 ? '-' : ''}${money(afterWin.avgNet)} after a winning day.`)
    else findings.push('You bounce back well: the day after a loss is no worse than the day after a win.')
    if (afterLoss.tradesPerDay >= afterWin.tradesPerDay * 1.3 && afterLoss.tradesPerDay - afterWin.tradesPerDay >= 0.5)
      findings.push(`You trade more after a loss (${afterLoss.tradesPerDay.toFixed(1)} trades vs ${afterWin.tradesPerDay.toFixed(1)}), trying to win it back.`)
    else if (afterWin.tradesPerDay >= afterLoss.tradesPerDay * 1.3 && afterWin.tradesPerDay - afterLoss.tradesPerDay >= 0.5)
      findings.push(`You trade less after a loss (${afterLoss.tradesPerDay.toFixed(1)} trades vs ${afterWin.tradesPerDay.toFixed(1)}), which looks like a healthy cool-off.`)
    if (afterLoss.sizeRatio > afterWin.sizeRatio * 1.15 && afterLoss.sizeRatio > 1)
      findings.push(`You size up after a losing day (${afterLoss.sizeRatio.toFixed(2)}× your median vs ${afterWin.sizeRatio.toFixed(2)}×).`)
    if (afterWin.planRate - afterLoss.planRate >= 15)
      findings.push(`You follow your plan less the day after a loss (${Math.round(afterLoss.planRate)}% vs ${Math.round(afterWin.planRate)}%).`)
  } else findings.push('Need at least 3 trading days after a winning day and after a losing day for a verdict.')

  return { enough, afterLoss, afterWin, afterTwoLosses, findings }
}

// ---- Confidence ----------------------------------------------------------------------------------

export function confidence(rows: Row[]) {
  const rated = rows.filter((r) => r.trade.confidence && r.trade.confidence >= 1 && r.trade.confidence <= 5)
  const stat = (a: Row[]) => {
    const s = summarize(a)
    return { count: a.length, winRate: s.winRate, avgNet: a.length ? s.net / a.length : 0, net: s.net }
  }
  const levels = [1, 2, 3, 4, 5].map((level) => ({ level, ...stat(rated.filter((r) => r.trade.confidence === level)) }))
  const low = stat(rated.filter((r) => r.trade.confidence! <= 2))
  const high = stat(rated.filter((r) => r.trade.confidence! >= 4))

  let verdict: string
  if (rated.length === 0) verdict = 'Rate your confidence (1–5) on new trades to see whether your gut is reliable.'
  else if (low.count < 3 || high.count < 3) verdict = 'Need at least 3 low-confidence (1–2) and 3 high-confidence (4–5) trades for a verdict.'
  else if (high.avgNet > low.avgNet && high.winRate >= low.winRate)
    verdict = `Your gut is a decent guide: high-confidence trades average ${money(high.avgNet)}${high.avgNet < 0 ? ' loss' : ''} vs ${money(low.avgNet)}${low.avgNet < 0 ? ' loss' : ''} when you were unsure. Consider sizing up only when confidence is high.`
  else if (high.avgNet < low.avgNet)
    verdict = `⚠ Your high-confidence trades do worse than your doubtful ones (${high.avgNet < 0 ? '-' : ''}${money(high.avgNet)} vs ${low.avgNet < 0 ? '-' : ''}${money(low.avgNet)} per trade). Feeling sure isn't a reliable signal for you, and it may be overconfidence.`
  else verdict = 'Confidence and results are roughly unrelated so far, so your gut is not a useful signal yet.'

  return { rated: rated.length, unrated: rows.length - rated.length, levels, low, high, verdict }
}

// ---- Notes ---------------------------------------------------------------------------------------

const UNI_STOP = new Set(('the a an and or but of to in on at for with it is was were be been this that these those i my me we so as by from had have has did do not no ' +
  'just then than if when after before again into out up down over about would could should will can its im got get very too also more some any all one ' +
  'trade trades today').split(' '))
const BI_STOP = new Set('the a an and or of to in on at for with it is was i my me we so as by'.split(' '))

const words = (text: string) => (text.toLowerCase().replace(/['’]/g, '').match(/[a-z]+/g) ?? [])

/** Words and two-word phrases that recur in your notes, with how those trades did. */
export function noteWords(rows: Row[], limit = 14) {
  const seen = new Map<string, Set<number>>()
  rows.forEach((r, i) => {
    const w = words(r.trade.notes)
    const grams = new Set<string>()
    for (const x of w) if (x.length >= 3 && !UNI_STOP.has(x)) grams.add(x)
    for (let j = 0; j + 1 < w.length; j++) if (!BI_STOP.has(w[j]) && !BI_STOP.has(w[j + 1]) && (w[j].length >= 3 || w[j + 1].length >= 3)) grams.add(`${w[j]} ${w[j + 1]}`)
    for (const g of grams) seen.set(g, (seen.get(g) ?? new Set()).add(i))
  })
  // Phrases that appear in exactly the same trades say the same thing: keep one (the longest single word,
  // else the longest phrase) so the list isn't a wall of near-duplicates.
  const groups = new Map<string, { phrases: string[]; idx: Set<number> }>()
  for (const [phrase, idx] of seen) {
    if (idx.size < 2) continue
    const key = [...idx].sort((a, b) => a - b).join(',')
    const g = groups.get(key) ?? { phrases: [], idx }
    g.phrases.push(phrase)
    groups.set(key, g)
  }
  const pick = (ps: string[]) => {
    const singles = ps.filter((x) => !x.includes(' '))
    const pool = singles.length ? singles : ps
    return [...pool].sort((a, b) => b.length - a.length || a.localeCompare(b))[0]
  }
  return [...groups.values()]
    .map((g) => ({ phrase: pick(g.phrases), idx: g.idx }))
    .map(({ phrase, idx }) => {
      const rs = [...idx].map((i) => rows[i])
      const net = sum(rs.map((r) => r.res.net))
      return { phrase, count: rs.length, net, avgNet: net / rs.length, winRate: (rs.filter((r) => r.res.net > 0).length / rs.length) * 100 }
    })
    .sort((a, b) => b.count - a.count || Math.abs(b.net) - Math.abs(a.net) || b.phrase.split(' ').length - a.phrase.split(' ').length)
    .slice(0, limit)
}

export function searchNotes(rows: Row[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return { matches: [] as Row[], summary: null }
  const matches = rows
    .filter((r) => r.trade.notes.toLowerCase().includes(q))
    .sort((a, b) => b.trade.date.localeCompare(a.trade.date) || (b.trade.id ?? 0) - (a.trade.id ?? 0))
  return { matches, summary: matches.length ? summarize(matches) : null }
}

/** Text around the first match, split so the match can be highlighted. */
export function snippet(text: string, query: string, before = 32, after = 56) {
  const q = query.trim().toLowerCase()
  const i = text.toLowerCase().indexOf(q)
  if (i < 0 || !q) return { pre: text.slice(0, before + after), hit: '', post: '' }
  const start = Math.max(0, i - before)
  const end = Math.min(text.length, i + q.length + after)
  return { pre: (start > 0 ? '…' : '') + text.slice(start, i), hit: text.slice(i, i + q.length), post: text.slice(i + q.length, end) + (end < text.length ? '…' : '') }
}
