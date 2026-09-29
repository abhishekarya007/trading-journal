import { useMemo, useState } from 'react'
import type { Row } from '../lib/stats'
import { localDate } from '../lib/week'
import { inr } from '../lib/format'

export default function Calendar({ rows }: { rows: Row[] }) {
  const [month, setMonth] = useState(() => localDate().slice(0, 7))
  const [y, m] = month.split('-').map(Number)

  const byDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rows) if (r.trade.date.startsWith(month)) map.set(r.trade.date, (map.get(r.trade.date) ?? 0) + r.res.net)
    return map
  }, [rows, month])

  const daysInMonth = new Date(y, m, 0).getDate()
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7 // Monday-first
  const total = [...byDay.values()].reduce((a, b) => a + b, 0)
  const shift = (d: number) => {
    const dt = new Date(y, m - 1 + d, 1)
    setMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">P&amp;L calendar · {new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</h3>
        <div className="flex items-center gap-2 text-sm">
          <span className={`num font-semibold ${total >= 0 ? 'text-up' : 'text-down'}`}>{inr(total)}</span>
          <button className="btn-ghost" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
          <button className="btn-ghost" onClick={() => shift(1)} aria-label="Next month">›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="pb-1 text-[11px] uppercase tracking-wider text-muted">{d}</div>)}
        {Array.from({ length: offset }, (_, i) => <div key={`o${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const key = `${month}-${String(day).padStart(2, '0')}`
          const v = byDay.get(key)
          const cls = v === undefined ? 'bg-panel2' : v >= 0 ? 'bg-up/15 text-up' : 'bg-down/15 text-down'
          return (
            <div key={key} className={`rounded-lg p-1.5 ${cls}`} title={v === undefined ? key : `${key}: ${inr(v, 2)}`}>
              <div className="text-[10px] opacity-70">{day}</div>
              <div className="num text-[11px] font-medium">{v === undefined ? '·' : inr(Math.round(v))}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
