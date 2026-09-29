import { useMemo, useState } from 'react'
import type { Row } from '../lib/stats'
import type { MonthCap } from '../lib/capital'
import { localDate } from '../lib/week'
import { inr } from '../lib/format'

export default function Calendar({ rows, caps }: { rows: Row[]; caps?: Map<string, MonthCap> }) {

  const today = localDate()
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [y, m] = month.split('-').map(Number)

  const byDay = useMemo(() => {
    const map = new Map<string, { net: number; n: number }>()
    for (const r of rows) {
      if (!r.trade.date.startsWith(month)) continue
      const e = map.get(r.trade.date) ?? { net: 0, n: 0 }
      e.net += r.res.net
      e.n += 1
      map.set(r.trade.date, e)
    }
    return map
  }, [rows, month])

  const vals = [...byDay.values()]
  const maxAbs = Math.max(1, ...vals.map((v) => Math.abs(v.net)))
  const total = vals.reduce((a, b) => a + b.net, 0)
  const cap = caps?.get(month)
  const green = vals.filter((v) => v.net > 0).length
  const red = vals.filter((v) => v.net < 0).length
  const daysInMonth = new Date(y, m, 0).getDate()
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7 // Monday-first
  const shift = (d: number) => {
    const dt = new Date(y, m - 1 + d, 1)
    setMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">P&amp;L calendar</h3>
          <p className="text-xs text-muted">{new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} · <span className="text-up">{green} green</span> · <span className="text-down">{red} red</span> days{cap && <> · trading with <span className="num text-fg">{inr(cap.capital)}</span></>}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`num mr-1 text-lg font-semibold ${total >= 0 ? 'text-up' : 'text-down'}`}>{total > 0 ? '+' : ''}{inr(total)}</span>
          {cap && cap.trades > 0 && <span className={`num -ml-1 mr-1 text-xs font-semibold ${cap.returnPct >= 0 ? 'text-up' : 'text-down'}`}>({cap.returnPct > 0 ? '+' : ''}{cap.returnPct.toFixed(2)}%)</span>}
          <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
          <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => shift(1)} aria-label="Next month">›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">{d}</div>)}
        {Array.from({ length: offset }, (_, i) => <div key={`o${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const key = `${month}-${String(day).padStart(2, '0')}`
          const v = byDay.get(key)
          const strength = v ? Math.round(14 + 50 * (Math.abs(v.net) / maxAbs)) : 0
          const style = v
            ? { background: `color-mix(in srgb, var(${v.net >= 0 ? '--up' : '--down'}) ${strength}%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(${v.net >= 0 ? '--up' : '--down'}) 35%, transparent)` }
            : undefined
          return (
            <div key={key} style={style} title={v ? `${key}: ${inr(v.net, 2)} · ${v.n} trades` : key}
              className={`relative min-h-[52px] rounded-xl p-1.5 transition hover:z-10 hover:scale-[1.06] ${v ? '' : 'bg-panel2/50'} ${key === today ? 'ring-2 ring-accent' : ''}`}>
              <div className={`text-left text-[10px] ${v ? 'text-fg/80' : 'text-muted/70'}`}>{day}</div>
              {v && <div className="num mt-0.5 text-[11px] font-semibold text-fg">{v.net > 0 ? '+' : ''}{inr(Math.round(v.net))}</div>}
              {v && <div className="text-[9px] text-fg/60">{v.n}t</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
