import type { Trade } from './types'
import type { Row } from './stats'
import { inr } from './format'
import { holdMinutes } from './insights'

/** A new-trade template from an existing one: same instrument and plan, but no outcome or journal entries. */
export function duplicateTemplate(t: Trade, today: string): Trade {
  return {
    date: today,
    symbol: t.symbol,
    side: t.side,
    qty: t.qty,
    entryPrice: t.entryPrice,
    exitPrice: 0,
    stopLoss: t.stopLoss,
    target: t.target,
    setup: t.setup,
    emotion: t.emotion,
    followedPlan: true,
    mistakes: [],
    notes: '',
  }
}

/** Plain-text summary suitable for pasting into chat or notes. */
export function tradeSummary({ trade: t, res }: Row): string {
  const hold = holdMinutes(t)
  const parts = [
    `${t.symbol} ${t.side.toUpperCase()} · ${t.date}${t.entryTime ? ` ${t.entryTime}` : ''}${t.exitTime ? `–${t.exitTime}` : ''}`,
    `Qty ${t.qty} · Entry ${t.entryPrice} → Exit ${t.exitPrice}`,
    [t.stopLoss ? `SL ${t.stopLoss}` : '', t.target ? `Target ${t.target}` : ''].filter(Boolean).join(' · '),
    `Net ${res.net > 0 ? '+' : ''}${inr(res.net, 2)} (gross ${inr(res.gross, 2)}, charges ${inr(res.charges.total, 2)})` +
      ` · ${res.returnPct > 0 ? '+' : ''}${res.returnPct}%${res.rMultiple !== null ? ` · ${res.rMultiple}R` : ''}${hold !== null ? ` · held ${hold}m` : ''}`,
    `Setup: ${t.setup || '–'} · Emotion: ${t.emotion || '–'} · ${t.followedPlan ? 'Followed plan' : 'Broke plan'}`,
    t.mistakes.length ? `Mistakes: ${t.mistakes.join(', ')}` : '',
    t.notes.trim() ? `Notes: ${t.notes.trim()}` : '',
  ]
  return parts.filter(Boolean).join('\n')
}
