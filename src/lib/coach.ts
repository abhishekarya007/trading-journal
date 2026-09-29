import type { Row } from './stats'
import { summarize } from './stats'
import { adherence, mistakeCost, overtrading, reentry, scorecard, sizing, timeOfDay } from './insights'
import { addDays } from './week'

export interface WorkItem {
  id: string
  title: string
  cost: number // rupees lost to this habit (positive number)
  detail: string
  focus: string // ready-made sentence for the weekly focus
  estimate?: boolean // depends on a guess (e.g. price reaching a target)
}

const money = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`

/** The last 30 days if there are enough trades in them, otherwise everything. */
export function coachRows(rows: Row[], today: string, minRecent = 12) {
  const cutoff = addDays(today, -30)
  const recent = rows.filter((r) => r.trade.date >= cutoff)
  return recent.length >= minRecent
    ? { rows: recent, scope: 'the last 30 days' }
    : { rows, scope: rows.length ? 'all your trades' : 'no trades yet' }
}

/**
 * Habits that cost you money, worst first. Each figure is measured on its own, so one trade can count under
 * several habits and the amounts must not be added together.
 */
export function workOn(rows: Row[], exitTags: string[], limit = 3): { items: WorkItem[]; total: number; enough: boolean } {
  const MIN_TRADES = 8
  if (rows.length < MIN_TRADES) return { items: [], total: 0, enough: false }
  const items: WorkItem[] = []
  const add = (i: WorkItem) => { if (i.cost > 0) items.push(i) }

  // Entry / behaviour mistakes you tagged
  const mistakes = mistakeCost(rows, exitTags)
  for (const m of mistakes.table)
    if (m.count >= 2 && m.split.net < 0)
      add({ id: `mistake:${m.tag}`, title: `“${m.tag}” trades`, cost: -m.split.net,
        detail: `${m.count} trades tagged, costing ${money(m.split.net)} (shared fairly when a trade has several tags).`,
        focus: `No “${m.tag}” trades this week. Check for it before every entry.` })

  // Breaking the plan
  const broke = rows.filter((r) => !r.trade.followedPlan)
  const brokeNet = broke.reduce((s, r) => s + r.res.net, 0)
  if (broke.length >= 3 && brokeNet < 0)
    add({ id: 'plan', title: 'Breaking your plan', cost: -brokeNet,
      detail: `${broke.length} plan-breaking trades lost ${money(brokeNet)} in total.`,
      focus: 'Follow my plan on every trade, with no exceptions.' })

  const adh = adherence(rows)
  if (adh.heldPast >= 2)
    add({ id: 'stop', title: 'Holding past your stop-loss', cost: adh.heldPastAmount,
      detail: `${adh.heldPast} losses ran about ${adh.avgOvershootR.toFixed(1)}R past the planned stop, roughly ${money(adh.heldPastAmount)} of extra loss.`,
      focus: 'Exit at my stop-loss. Never widen it.' })
  if (adh.exitedEarly >= 2 && adh.leftAmount > 0)
    add({ id: 'early', title: 'Exiting before your target', cost: adh.leftAmount, estimate: true,
      detail: `${adh.exitedEarly} winning trades closed short of the target: up to ${money(adh.leftAmount)} left on the table (only if price had reached the target).`,
      focus: 'Hold winners to my target unless my exit rule triggers.' })

  const gap = reentry(rows)
  if (gap.quick.count >= 2 && gap.quick.net < 0)
    add({ id: 'reentry', title: 'Re-entering right after a loss', cost: -gap.quick.net,
      detail: `${gap.quick.count} trades started within 5 minutes of a loss and lost ${money(gap.quick.net)} together.`,
      focus: 'After every loss, wait 15 minutes before the next trade.' })

  const busy = overtrading(rows).filter((b) => b.name === '4–5 trades' || b.name === '6+ trades')
  const busyNet = busy.reduce((s, b) => s + b.totalNet, 0)
  const busyDays = busy.reduce((s, b) => s + b.days, 0)
  if (busyDays >= 2 && busyNet < 0)
    add({ id: 'overtrading', title: 'Overtrading days (4+ trades)', cost: -busyNet,
      detail: `${busyDays} days with 4 or more trades lost ${money(busyNet)} in total.`,
      focus: 'Take at most 3 trades a day.' })

  const size = sizing(rows)
  const overNet = size.oversized.avgNet * size.oversized.count
  const alreadyTagged = mistakes.table.some((m) => /oversize/i.test(m.tag))
  if (!alreadyTagged && size.oversized.count >= 3 && overNet < 0)
    add({ id: 'oversized', title: 'Oversized trades', cost: -overNet,
      detail: `${size.oversized.count} trades bigger than ${size.overFactor}× your median size lost ${money(overNet)} together.`,
      focus: 'Use my standard position size on every trade.' })

  const hours = timeOfDay(rows).data.filter((h) => h.count >= 3 && h.net < 0).sort((a, b) => a.net - b.net)
  if (hours[0])
    add({ id: 'hour', title: `Trading around ${hours[0].name}`, cost: -hours[0].net,
      detail: `${hours[0].count} trades entered in that hour lost ${money(hours[0].net)} in total.`,
      focus: `No new entries around ${hours[0].name}.` })

  const setups = scorecard(rows, (r) => r.trade.setup || 'None').filter((s) => s.count >= 4 && s.net < 0).sort((a, b) => a.net - b.net)
  if (setups[0]) {
    const s = setups[0]
    add({ id: `setup:${s.name}`, title: `The “${s.name}” setup`, cost: -s.net,
      detail: `${s.count} trades, ${s.winRate.toFixed(0)}% won, net ${money(s.net)}.`,
      focus: `Pause the ${s.name} setup until I've reviewed why it loses.` })
  }

  items.sort((a, b) => b.cost - a.cost)
  return { items: items.slice(0, limit), total: items.length, enough: true }
}

export { summarize }
