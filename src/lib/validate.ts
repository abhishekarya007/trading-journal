import type { Trade } from './types'

export interface Validation {
  errors: string[] // block saving
  warnings: string[] // worth a look, but allowed
  duplicate: Trade | null
}

const mins = (t?: string) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m
}
const OPEN = 9 * 60 + 15
const CLOSE = 15 * 60 + 30

/** Sanity checks for a trade being entered. `existing` is every saved trade (the one being edited is skipped). */
export function validateTrade(t: Trade, existing: Trade[], today: string): Validation {
  const errors: string[] = []
  const warnings: string[] = []

  if (t.date && t.date > today) errors.push('The date is in the future.')
  if (t.qty && !Number.isInteger(t.qty)) errors.push('Quantity must be a whole number.')
  const inT = mins(t.entryTime)
  const outT = mins(t.exitTime)
  if (inT !== null && outT !== null && outT < inT) errors.push('Exit time is before entry time.')

  if (t.date) {
    const [y, m, d] = t.date.split('-').map(Number)
    const dow = new Date(y, m - 1, d).getDay()
    if (dow === 0 || dow === 6) warnings.push('That date is a weekend, when NSE is closed.')
  }
  if ((inT !== null && (inT < OPEN || inT > CLOSE)) || (outT !== null && (outT < OPEN || outT > CLOSE)))
    warnings.push('A time is outside NSE trading hours (9:15 AM to 3:30 PM).')

  const long = t.side === 'Long'
  if (t.entryPrice > 0) {
    if (t.stopLoss && (long ? t.stopLoss >= t.entryPrice : t.stopLoss <= t.entryPrice))
      warnings.push(`For a ${long ? 'long' : 'short'} trade the stop-loss (${t.stopLoss}) should be ${long ? 'below' : 'above'} the entry (${t.entryPrice}).`)
    if (t.target && (long ? t.target <= t.entryPrice : t.target >= t.entryPrice))
      warnings.push(`For a ${long ? 'long' : 'short'} trade the target (${t.target}) should be ${long ? 'above' : 'below'} the entry (${t.entryPrice}).`)
    if (t.exitPrice > 0) {
      const move = Math.abs(t.exitPrice / t.entryPrice - 1) * 100
      if (move > 10) warnings.push(`The exit is ${move.toFixed(1)}% away from the entry. Is that a typo?`)
    }
  }

  let duplicate: Trade | null = null
  if (t.symbol.trim() && t.qty > 0 && t.entryPrice > 0 && t.exitPrice > 0) {
    const sym = t.symbol.trim().toUpperCase()
    duplicate =
      existing.find((e) =>
        e.id !== t.id && e.date === t.date && e.symbol === sym && e.side === t.side && e.qty === t.qty &&
        e.entryPrice === t.entryPrice && e.exitPrice === t.exitPrice && mins(e.entryTime) === mins(t.entryTime)) ?? null
    if (duplicate) warnings.push(`This looks identical to a ${sym} trade you already logged on ${t.date}.`)
  }
  return { errors, warnings, duplicate }
}
