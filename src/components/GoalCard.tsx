import { Link } from 'react-router-dom'
import type { GoalStatus } from '../lib/goals'
import { inr } from '../lib/format'

const PACE = { ahead: ['Ahead of pace', 'text-up'], on: ['On pace', 'text-accent'], behind: ['Behind pace', 'text-warn'] } as const
const LOSS_BAR = { off: '', ok: 'var(--up)', warn: 'var(--warn)', hit: 'var(--down)' } as const

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-panel2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, Math.max(0, pct)))}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  )
}

/** The month's profit goal and loss limit as two progress bars. */
export default function GoalCard({ status: s, monthLabel }: { status: GoalStatus; monthLabel: string }) {
  const none = s.goal <= 0 && s.maxLoss <= 0
  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Month goal &amp; loss limit</h3>
          <p className="text-xs text-muted">{monthLabel}</p>
        </div>
        <Link to="/settings" className="text-xs text-accent hover:underline">{none ? 'Set them up →' : 'Edit →'}</Link>
      </div>

      {none ? (
        <p className="py-3 text-sm text-muted">Set a profit goal and a maximum loss for the month, and the dashboard will show how you are doing and warn you before you reach the limit.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="label !mb-0">Profit goal</span>
              {s.goal > 0 && <span className="num font-semibold">{inr(Math.max(0, s.net))} <span className="font-normal text-muted">of {inr(s.goal)}</span></span>}
            </div>
            {s.goal <= 0 ? <p className="text-xs text-muted">No goal set for this month.</p> : (
              <>
                <Bar pct={s.goalPct} color="linear-gradient(90deg, var(--up), var(--accent))" />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  {s.reached
                    ? <span className="font-semibold text-up">🎉 Goal reached{s.net > s.goal && <> · {inr(s.net - s.goal)} over</>}</span>
                    : <span className="text-muted"><b className="num text-fg">{inr(s.goalLeft)}</b> to go{s.weekdaysLeft > 0 && s.perDayNeeded !== null && <> · {s.weekdaysLeft} weekdays left, about <b className="num text-fg">{inr(s.perDayNeeded)}</b> a day</>}</span>}
                  <span className="flex items-center gap-2">
                    {s.pace && <span className={`font-medium ${PACE[s.pace][1]}`}>{PACE[s.pace][0]}</span>}
                    <span className="num text-muted">{Math.max(0, Math.round(s.goalPct))}%</span>
                  </span>
                </div>
              </>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="label !mb-0">Loss limit</span>
              {s.maxLoss > 0 && <span className="num font-semibold">{inr(s.lossUsed)} <span className="font-normal text-muted">of {inr(s.maxLoss)}</span></span>}
            </div>
            {s.maxLoss <= 0 ? <p className="text-xs text-muted">No loss limit set for this month.</p> : (
              <>
                <Bar pct={s.lossUsedPct} color={LOSS_BAR[s.lossState]} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  {s.lossState === 'hit'
                    ? <span className="font-semibold text-down">Limit reached. Consider stopping for the month.</span>
                    : s.lossUsed === 0
                      ? <span className="text-muted">No loss so far this month, <b className="num text-fg">{inr(s.maxLoss)}</b> of room.</span>
                      : <span className={s.lossState === 'warn' ? 'text-warn' : 'text-muted'}><b className="num text-fg">{inr(s.lossLeft)}</b> left before your limit</span>}
                  <span className="num text-muted">{Math.round(s.lossUsedPct)}% used</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
