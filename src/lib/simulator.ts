/**
 * A trade simulator. Every simulated trade is a win (with probability = win rate) that makes `rr` times the amount risked,
 * or a loss that costs exactly what was risked. Run it thousands of times and you see the whole range of futures a style of
 * trading can produce, not just the average.
 */

export interface SimInput {
  trades: number // trades in each simulated run
  winRate: number // 0 to 100
  rr: number // reward : risk of a winner (1.5 = wins pay 1.5x what a loss costs)
  capital: number // starting capital, ₹
  riskMode: 'fixed' | 'pct' // risk a fixed ₹ amount, or a % of the capital you have at that moment
  risk: number // ₹ or %, depending on riskMode
  charges: number // ₹ lost to brokerage and taxes on every trade
  variation: number // 0 to 0.9: how much trade sizes wander (winners ± this, losers up to this much worse than the stop)
  runs: number // how many futures to simulate
  seed: number
  tradesPerDay: number // 0 = ignore days. Otherwise trades are grouped into days of this size, so the day rules below can apply
  stopAfterLosses: number // 0 = off. Stop trading for the day after this many losses in a row
  dailyLossR: number // 0 = off. Stop trading for the day once down this many R
  goal: number // 0 = none. A profit target in ₹, to show the chance of reaching it
}

export const DEFAULT_SIM: SimInput = { trades: 100, winRate: 45, rr: 1.5, capital: 100000, riskMode: 'pct', risk: 1, charges: 0, variation: 0, runs: 1000, seed: 1, tradesPerDay: 0, stopAfterLosses: 0, dailyLossR: 0, goal: 0 }

/** The most numbers the simulator will hold in memory (runs x trades), so a huge request can't freeze the page. */
export const MAX_CELLS = 3_000_000

/** Small, fast, repeatable random numbers: the same seed gives the same simulation. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clampInput = (i: SimInput): SimInput => {
  const trades = Math.max(1, Math.min(1000, Math.round(i.trades) || 1))
  const maxRuns = Math.max(50, Math.floor(MAX_CELLS / (trades + 1)))
  return {
    ...i,
    trades,
    winRate: Math.max(0, Math.min(100, Number(i.winRate) || 0)),
    rr: Math.max(0.05, Number(i.rr) || 0.05),
    capital: Math.max(1, Number(i.capital) || 1),
    risk: Math.max(0, Number(i.risk) || 0),
    charges: Math.max(0, Number(i.charges) || 0),
    variation: Math.max(0, Math.min(0.9, Number(i.variation) || 0)),
    runs: Math.max(50, Math.min(5000, maxRuns, Math.round(i.runs) || 50)),
    tradesPerDay: Math.max(0, Math.min(50, Math.round(Number(i.tradesPerDay) || 0))),
    stopAfterLosses: Math.max(0, Math.round(Number(i.stopAfterLosses) || 0)),
    dailyLossR: Math.max(0, Number(i.dailyLossR) || 0),
    goal: Math.max(0, Number(i.goal) || 0),
  }
}

/* ---------- the maths, without any randomness ---------- */

/** Average result of one trade in R (multiples of the amount risked), before charges. */
export const expectancyR = (winRate: number, rr: number) => (winRate / 100) * rr - (1 - winRate / 100)
/** The win rate at which a given reward : risk exactly breaks even (before charges). */
export const breakevenWinRate = (rr: number) => 100 / (1 + rr)
/** The reward : risk a given win rate needs to break even. Infinity when you never win. */
export const breakevenRR = (winRate: number) => (winRate <= 0 ? Infinity : (100 - winRate) / winRate)

/** Average ₹ result of one trade at the amount risked, including charges. */
export const expectancyMoney = (i: Pick<SimInput, 'winRate' | 'rr' | 'charges'>, riskAmount: number) => expectancyR(i.winRate, i.rr) * riskAmount - i.charges

/* ---------- the simulation ---------- */

export interface SimResult {
  input: SimInput
  finals: number[] // ending capital of every run, sorted
  bands: { step: number; p10: number; p50: number; p90: number }[] // capital at each trade number
  samples: number[][] // a few full equity paths to draw
  hist: { from: number; to: number; count: number }[] // distribution of the result (ending capital minus starting capital)
  summary: {
    profitablePct: number
    mean: number
    median: number
    p5: number
    p95: number
    best: number
    worst: number
    avgMaxDrawdownPct: number
    p95MaxDrawdownPct: number
    medianLossStreak: number
    p95LossStreak: number
    worstLossStreak: number
    ruin: { drawdown: number; pct: number }[] // share of runs that fell at least this far from a peak
    wipedOutPct: number // share of runs that ended with nothing left
    goalPct: number | null // share of runs that reached the profit target (null when there is none)
    skippedPct: number // share of planned trades the day rules stopped you from taking
  }
}

export const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export const DRAWDOWN_LEVELS = [10, 20, 30, 50]

export function simulate(raw: SimInput): SimResult {
  const input = clampInput(raw)
  const { trades, runs, capital } = input
  const rand = rng(input.seed)
  const p = input.winRate / 100
  const width = trades + 1
  const equity = new Float32Array(runs * width)
  const finals: number[] = []
  const maxDD: number[] = []
  const streaks: number[] = []
  let skipped = 0

  for (let r = 0; r < runs; r++) {
    let eq = capital
    let peak = capital
    let dd = 0
    let streak = 0
    let longest = 0
    let dayLosses = 0
    let dayR = 0
    equity[r * width] = eq
    for (let i = 1; i <= trades; i++) {
      if (input.tradesPerDay > 0 && (i - 1) % input.tradesPerDay === 0) { dayLosses = 0; dayR = 0 }
      const stopped = input.tradesPerDay > 0 && ((input.stopAfterLosses > 0 && dayLosses >= input.stopAfterLosses) || (input.dailyLossR > 0 && dayR <= -input.dailyLossR))
      if (stopped) skipped++
      else if (eq > 0) {
        const riskAmt = Math.min(eq, input.riskMode === 'pct' ? (eq * input.risk) / 100 : input.risk)
        const win = rand() < p
        const u = rand()
        const rMult = win
          ? input.rr * (1 + (2 * u - 1) * input.variation) // winners wander either side of the target
          : -(1 + u * input.variation) // losers can only be worse than the stop, never better
        eq = Math.max(0, eq + rMult * riskAmt - input.charges)
        dayR += rMult
        if (win) { streak = 0; dayLosses = 0 }
        else { streak++; dayLosses++; if (streak > longest) longest = streak }
        if (eq > peak) peak = eq
        const d = peak > 0 ? (peak - eq) / peak : 0
        if (d > dd) dd = d
      }
      equity[r * width + i] = eq
    }
    finals.push(eq)
    maxDD.push(dd * 100)
    streaks.push(longest)
  }

  const bands: SimResult['bands'] = []
  const col = new Array<number>(runs)
  for (let i = 0; i <= trades; i++) {
    for (let r = 0; r < runs; r++) col[r] = equity[r * width + i]
    col.sort((a, b) => a - b)
    bands.push({ step: i, p10: quantile(col, 0.1), p50: quantile(col, 0.5), p90: quantile(col, 0.9) })
  }
  const samples = Array.from({ length: Math.min(30, runs) }, (_, r) => Array.from(equity.subarray(r * width, (r + 1) * width)))

  const sortedFinals = [...finals].sort((a, b) => a - b)
  const sortedDD = [...maxDD].sort((a, b) => a - b)
  const sortedStreaks = [...streaks].sort((a, b) => a - b)
  const mean = finals.reduce((s, x) => s + x, 0) / runs

  const lo = sortedFinals[0] - capital
  const hi = sortedFinals[runs - 1] - capital
  const bins = hi === lo ? 1 : 24
  const step = hi === lo ? 1 : (hi - lo) / bins
  const hist = Array.from({ length: bins }, (_, k) => ({ from: lo + k * step, to: lo + (k + 1) * step, count: 0 }))
  for (const f of finals) hist[Math.min(bins - 1, Math.floor((f - capital - lo) / step))].count++

  return {
    input, finals: sortedFinals, bands, samples, hist,
    summary: {
      profitablePct: (finals.filter((f) => f > capital).length / runs) * 100,
      mean, median: quantile(sortedFinals, 0.5), p5: quantile(sortedFinals, 0.05), p95: quantile(sortedFinals, 0.95),
      best: sortedFinals[runs - 1], worst: sortedFinals[0],
      avgMaxDrawdownPct: maxDD.reduce((s, x) => s + x, 0) / runs,
      p95MaxDrawdownPct: quantile(sortedDD, 0.95),
      medianLossStreak: quantile(sortedStreaks, 0.5), p95LossStreak: quantile(sortedStreaks, 0.95), worstLossStreak: sortedStreaks[runs - 1],
      ruin: DRAWDOWN_LEVELS.map((d) => ({ drawdown: d, pct: (maxDD.filter((x) => x >= d).length / runs) * 100 })),
      wipedOutPct: (finals.filter((f) => f <= 0).length / runs) * 100,
      goalPct: input.goal > 0 ? (finals.filter((f) => f - capital >= input.goal).length / runs) * 100 : null,
      skippedPct: (skipped / (runs * trades)) * 100,
    },
  }
}

/** Average R per trade for a grid of win rates and reward : risk, for the "what makes me profitable" map. */
export const WIN_RATES = [30, 35, 40, 45, 50, 55, 60, 65, 70]
export const RRS = [0.5, 0.75, 1, 1.5, 2, 2.5, 3]
export const expectancyGrid = () => RRS.map((rr) => WIN_RATES.map((wr) => expectancyR(wr, rr)))

/** What to change to become profitable, in plain numbers. */
export function advice(i: Pick<SimInput, 'winRate' | 'rr' | 'charges'>, riskAmount: number) {
  const e = expectancyR(i.winRate, i.rr)
  const chargesR = riskAmount > 0 ? i.charges / riskAmount : 0 // charges expressed in R
  const net = e - chargesR
  // the win rate / reward:risk needed to cover charges too
  const needWinRate = ((1 + chargesR) / (1 + i.rr)) * 100
  const needRR = i.winRate <= 0 ? Infinity : ((1 - i.winRate / 100) + chargesR) / (i.winRate / 100)
  return { expectancyR: e, chargesR, netR: net, profitable: net > 0, needWinRate, needRR }
}

/** One made-up sequence of trades, trade by trade, for showing as a row of green and red squares. */
export function exampleRun(raw: SimInput, seed: number) {
  const input = clampInput(raw)
  const rand = rng(seed)
  const p = input.winRate / 100
  const riskAmt = input.riskMode === 'pct' ? (input.capital * input.risk) / 100 : input.risk
  let total = 0
  let longestLosses = 0
  let streak = 0
  const trades = Array.from({ length: input.trades }, () => {
    const win = rand() < p
    const u = rand()
    const r = win ? input.rr * (1 + (2 * u - 1) * input.variation) : -(1 + u * input.variation)
    const amount = r * riskAmt - input.charges
    total += amount
    if (win) streak = 0
    else { streak++; longestLosses = Math.max(longestLosses, streak) }
    return { win, amount }
  })
  return { trades, total, wins: trades.filter((t) => t.win).length, longestLosses }
}

/** Kelly criterion: the share of capital to risk per trade that grows money fastest. 0 when there is no edge. */
export const kellyPct = (winRate: number, rr: number) => Math.max(0, (winRate / 100 - (1 - winRate / 100) / Math.max(0.0001, rr)) * 100)

/** Chance of ever losing `ruinPct` percent of the starting capital, found by simulation of a long run. */
export const longRunRuin = (i: SimInput, ruinPct = 50) => {
  const r = simulate({ ...i, trades: Math.max(i.trades, 300), runs: Math.min(i.runs, 1500), seed: i.seed + 99 })
  return (r.finals.length ? r.summary.ruin.find((x) => x.drawdown === ruinPct)?.pct : 0) ?? 0
}
