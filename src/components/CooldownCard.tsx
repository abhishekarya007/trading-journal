import { elapsedPct, formatClock, useCooldown } from '../lib/cooldown'
import { IconTimer } from './Icons'

/** Sidebar entry for the cooldown timer: a start button when idle, a live countdown while running. */
export default function CooldownCard({ collapsed, onOpen }: { collapsed: boolean; onOpen: () => void }) {
  const { cd, now, remaining, active } = useCooldown()

  if (collapsed) {
    return (
      <button type="button" onClick={onOpen} aria-label={active ? `Cooldown ${formatClock(remaining)} left` : 'Start a cooldown timer'} title={active ? `Cooldown: ${formatClock(remaining)} left` : 'Cooldown timer  ( C )'}
        className={`flex h-11 w-full flex-col items-center justify-center rounded-xl border transition hover:border-accent/50 ${active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line bg-panel2/50 text-muted hover:text-fg'}`}>
        <IconTimer />
        {active && <span className="num -mt-0.5 text-[9px] font-semibold leading-none">{formatClock(remaining)}</span>}
      </button>
    )
  }
  if (active && cd) {
    return (
      <button type="button" onClick={onOpen} className="w-full rounded-xl border border-accent/50 bg-accent/10 px-3 py-2.5 text-left transition hover:bg-accent/15" aria-label={`Cooldown, ${formatClock(remaining)} left. Open timer`}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-medium text-accent"><IconTimer /> Cooldown</span>
          <span className="num text-lg font-semibold">{formatClock(remaining)}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full bg-accent transition-all duration-1000" style={{ width: `${elapsedPct(cd, now)}%` }} /></div>
      </button>
    )
  }
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-panel2/50 px-3 py-2.5 text-sm text-muted transition hover:border-accent/50 hover:text-fg">
      <IconTimer /> <span className="flex-1 text-left">Cooldown timer</span> <span className="kbd">C</span>
    </button>
  )
}
