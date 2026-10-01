import type { ChargeBreakdown, ChargeRates, Side, Trade } from './types'
import { calcTrade } from './calc'

/** What a trade does to your account, charges included (brokerage, STT, exchange, SEBI, stamp duty, GST). */
export interface Outcome { gross: number; charges: ChargeBreakdown; net: number }

const probe = (side: Side, entry: number, exit: number, qty: number): Trade => ({
  date: '2000-01-01', symbol: '-', side, qty, entryPrice: entry, exitPrice: exit,
  setup: '', emotion: '', followedPlan: true, mistakes: [], notes: '',
})

export function outcomeAt(side: Side, entry: number, exit: number, qty: number, rates: ChargeRates): Outcome {
  const r = calcTrade(probe(side, entry, exit, qty), rates)
  return { gross: r.gross, charges: r.charges, net: r.net }
}

export interface SizeInput {
  limit: number // the most you are willing to lose, in rupees, charges included
  entry: number
  stop: number
  target?: number
  side: Side
  rates: ChargeRates
}

export interface SizeResult {
  qty: number
  perShare: number
  positionValue: number
  atStop: Outcome // the trade if the stop-loss is hit
  loss: number // total rupee loss at the stop, charges included (positive number)
  priceLoss: number // the price move part of that loss
  wrongSide: boolean // stop-loss sits where hitting it would be a profit
  atTarget: (Outcome & { rewardPerShare: number; priceRR: number; netRR: number | null }) | null
}

/**
 * The largest whole quantity whose loss at the stop-loss, charges included, stays within `limit`.
 * Charges only ever grow with quantity, so the total loss rises steadily and a binary search finds the answer.
 */
export function sizeForLoss(i: SizeInput): SizeResult | null {
  if (!(i.entry > 0) || !(i.stop > 0) || i.entry === i.stop) return null
  const perShare = Math.abs(i.entry - i.stop)
  const wrongSide = i.side === 'Long' ? i.stop > i.entry : i.stop < i.entry
  const lossAt = (q: number) => -outcomeAt(i.side, i.entry, i.stop, q, i.rates).net

  let qty = 0
  if (!wrongSide && i.limit > 0) {
    let lo = 0
    let hi = Math.floor(i.limit / perShare) // the price move alone already uses this much of the limit
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (lossAt(mid) <= i.limit + 1e-9) lo = mid
      else hi = mid - 1
    }
    qty = lo
  }

  const atStop = outcomeAt(i.side, i.entry, i.stop, qty, i.rates)
  const loss = qty > 0 ? -atStop.net : 0
  let atTarget: SizeResult['atTarget'] = null
  if (i.target && i.target > 0 && (i.side === 'Long' ? i.target > i.entry : i.target < i.entry)) {
    const o = outcomeAt(i.side, i.entry, i.target, qty, i.rates)
    const rewardPerShare = Math.abs(i.target - i.entry)
    atTarget = { ...o, rewardPerShare, priceRR: rewardPerShare / perShare, netRR: qty > 0 && loss > 0 ? o.net / loss : null }
  }
  return { qty, perShare, positionValue: qty * i.entry, atStop, loss, priceLoss: qty > 0 ? -atStop.gross : 0, wrongSide, atTarget }
}

/** How much of today's loss budget is left: the limit minus what you've already lost today (profits don't add to it). */
export function dailyLeft(limit: number, dayNet: number): number | null {
  return limit > 0 ? Math.max(0, limit + Math.min(0, dayNet)) : null
}
