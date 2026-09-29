import { useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { equityCurve, type Row } from '../lib/stats'
import { localDate, weekDays, weekStart } from '../lib/week'
import { inr, pnlColor } from '../lib/format'
import { COLORS } from '../lib/theme'

const netOf = (rows: Row[], f: (d: string) => boolean) => {
  const rs = rows.filter((r) => f(r.trade.date))
  return { net: rs.reduce((s, r) => s + r.res.net, 0), count: rs.length }
}

export default function PnlHero({ rows, startingCapital }: { rows: Row[]; startingCapital: number }) {
  const today = localDate()
  const p = useMemo(() => {
    const week = weekDays(weekStart(today))
    return [
      ['Today', netOf(rows, (d) => d === today)],
      ['This week', netOf(rows, (d) => week.includes(d))],
      ['This month', netOf(rows, (d) => d.startsWith(today.slice(0, 7)))],
      ['All time', netOf(rows, () => true)],
    ] as const
  }, [rows, today])
  const spark = useMemo(() => equityCurve(rows, startingCapital).slice(-40), [rows, startingCapital])
  const up = spark.length < 2 || spark[spark.length - 1].equity >= spark[0].equity
  const color = up ? COLORS.up : COLORS.down

  return (
    <div className="card rise overflow-hidden">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4">
        {p.map(([label, v], i) => (
          <div key={label}>
            <div className="label !mb-1">{label}</div>
            <div className={`num font-semibold tracking-tight ${i === 0 ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl'} ${pnlColor(v.net)}`}>
              {v.net > 0 ? '+' : ''}{inr(v.net)}
            </div>
            <div className="mt-0.5 text-xs text-muted">{v.count} {v.count === 1 ? 'trade' : 'trades'}</div>
          </div>
        ))}
      </div>
      <div className="-mx-4 -mb-4 mt-5 h-20 md:-mx-5 md:-mb-5" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={spark} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Area dataKey="equity" stroke={color} strokeWidth={2} fill="url(#heroFill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
