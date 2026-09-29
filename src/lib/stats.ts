import type { Trade, TradeResult } from './types'

export interface Row {
  trade: Trade
  res: TradeResult
}

export interface Summary {
  count: number
  net: number
  charges: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  expectancy: number
  avgR: number | null
  maxDrawdown: number
}

export function summarize(rows: Row[]): Summary {
  const wins = rows.filter((r) => r.res.net > 0)
  const losses = rows.filter((r) => r.res.net < 0)
  const sum = (a: Row[]) => a.reduce((s, r) => s + r.res.net, 0)
  const grossWin = sum(wins)
  const grossLoss = Math.abs(sum(losses))
  const rs = rows.map((r) => r.res.rMultiple).filter((x): x is number => x !== null)

  let peak = 0
  let cum = 0
  let maxDrawdown = 0
  for (const r of sortByDate(rows)) {
    cum += r.res.net
    peak = Math.max(peak, cum)
    maxDrawdown = Math.max(maxDrawdown, peak - cum)
  }

  return {
    count: rows.length,
    net: sum(rows),
    charges: rows.reduce((s, r) => s + r.res.charges.total, 0),
    winRate: rows.length ? (wins.length / rows.length) * 100 : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancy: rows.length ? sum(rows) / rows.length : 0,
    avgR: rs.length ? rs.reduce((s, x) => s + x, 0) / rs.length : null,
    maxDrawdown,
  }
}

export function sortByDate(rows: Row[]): Row[] {
  return [...rows].sort(
    (a, b) => a.trade.date.localeCompare(b.trade.date) || (a.trade.id ?? 0) - (b.trade.id ?? 0),
  )
}

export function equityCurve(rows: Row[], startingCapital: number) {
  let cum = startingCapital
  return sortByDate(rows).map((r) => {
    cum += r.res.net
    return { date: r.trade.date, equity: Math.round(cum * 100) / 100 }
  })
}

export function groupNet(rows: Row[], key: (r: Row) => string[]) {
  const map = new Map<string, { net: number; count: number }>()
  for (const r of rows) {
    for (const k of key(r)) {
      const e = map.get(k) ?? { net: 0, count: 0 }
      e.net += r.res.net
      e.count += 1
      map.set(k, e)
    }
  }
  return [...map.entries()].map(([name, v]) => ({ name, net: Math.round(v.net), count: v.count }))
}
