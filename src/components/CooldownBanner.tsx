import { formatClock, requestOpenCooldown, stopCooldown, useCooldown } from '../lib/cooldown'
import { IconTimer } from './Icons'

/** Shown on pages where you prepare a trade, while a cooldown is running. */
export default function CooldownBanner() {
  const { active, remaining } = useCooldown()
  if (!active) return null
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3.5 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-accent"><IconTimer /></span>
        <div>
          <div className="font-semibold">Cooldown running · <span className="num">{formatClock(remaining)}</span> left</div>
          <p className="text-xs text-muted">Give yourself the time before the next trade. Your plan will still be there.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost text-xs" onClick={requestOpenCooldown}>Open timer</button>
        <button type="button" className="btn-ghost text-xs !text-down" onClick={stopCooldown}>End</button>
      </div>
    </div>
  )
}
