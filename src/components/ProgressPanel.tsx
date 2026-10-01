import { useMemo } from 'react'
import type { Settings } from '../lib/types'
import type { Row } from '../lib/stats'
import { milestones, streaks, type Milestone, type Streak } from '../lib/milestones'
import { localDate } from '../lib/week'

const when = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

function StreakCard({ title, hint, s, unit, empty }: { title: string; hint: string; s: Streak | null; unit: string; empty?: string }) {
  return (
    <div className="card">
      <div className="label">{title}</div>
      {s === null ? <p className="py-2 text-xs text-muted">{empty}</p> : (
        <>
          <div className="flex items-baseline gap-2">
            <span className={`num text-4xl font-semibold ${s.cur >= 3 ? 'text-up glow-up' : ''}`}>{s.cur}</span>
            <span className="text-sm text-muted">{unit}{s.cur >= 3 && ' 🔥'}</span>
          </div>
          <p className="mt-1 text-xs text-muted">Best ever: <b className="num text-fg">{s.best}</b> · {hint}</p>
        </>
      )}
    </div>
  )
}

function Badge({ m }: { m: Milestone }) {
  const done = !!m.achievedOn
  return (
    <div className={`card !p-4 transition ${done ? '!border-up/40' : 'opacity-80'}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${done ? 'bg-up/15' : 'bg-panel2 grayscale'}`} aria-hidden="true">{done ? '🏆' : '🔒'}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">{m.title}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{m.detail}</p>
          {done ? (
            <p className="mt-1.5 text-[11px] font-medium text-up">Reached {when(m.achievedOn!)}</p>
          ) : (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full bg-accent" style={{ width: `${(m.value / m.target) * 100}%` }} /></div>
              <p className="num mt-1 text-[11px] text-muted">{m.value} / {m.target}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ProgressPanel({ rows, settings }: { rows: Row[]; settings: Settings }) {
  const st = useMemo(() => streaks(rows, settings), [rows, settings])
  const ms = useMemo(() => milestones(rows, settings, localDate().slice(0, 7)), [rows, settings])
  const reached = ms.filter((m) => m.achievedOn).length
  const groups = ['Logging', 'Results', 'Discipline'] as const

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Streaks · consecutive trading days</h2>
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StreakCard title="Green days" s={st.greenDays} unit="days in profit" hint="days that ended in profit" />
          <StreakCard title="Inside your loss limit" s={st.withinLoss} unit="days" hint={`never past ${settings.risk.dailyLossLimit > 0 ? `₹${settings.risk.dailyLossLimit.toLocaleString('en-IN')}` : 'the limit'} a day`} empty="Set a daily loss limit in Settings to track this." />
          <StreakCard title="Following your plan" s={st.plan} unit="days" hint="every trade followed the plan" />
          <StreakCard title="Mistake-free" s={st.noMistake} unit="days" hint="no mistake tagged" />
          <StreakCard title="Inside your trade limit" s={st.withinTrades} unit="days" hint={`at most ${settings.risk.maxTradesPerDay} trades`} empty="Set a max trades per day in Settings to track this." />
        </div>
        <p className="mt-2 text-[11px] text-muted">Days you didn’t trade don’t break a streak.</p>
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Milestones</h2>
          <span className="num text-sm"><b className="text-up">{reached}</b> <span className="text-muted">of {ms.length} reached</span></span>
        </div>
        {groups.map((g) => {
          const list = ms.filter((m) => m.group === g)
          if (!list.length) return null
          return (
            <div key={g} className="mb-5">
              <div className="mb-2 text-sm font-semibold">{g}</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.map((m) => <Badge key={m.id} m={m} />)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
