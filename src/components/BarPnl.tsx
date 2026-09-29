import { useId } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { inr } from '../lib/format'
import { axisTick, COLORS, tooltipStyle } from '../lib/theme'

export default function BarPnl({ title, data }: { title: string; data: { name: string; net: number; count: number }[] }) {
  const id = useId().replace(/:/g, '')
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {data.length === 0 ? <p className="py-8 text-center text-sm text-muted">No data</p> : (
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={data}>
            <defs>
              <linearGradient id={`${id}u`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.up} stopOpacity={1} />
                <stop offset="100%" stopColor={COLORS.up} stopOpacity={0.35} />
              </linearGradient>
              <linearGradient id={`${id}d`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={COLORS.down} stopOpacity={1} />
                <stop offset="100%" stopColor={COLORS.down} stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis tick={axisTick} width={50} tickLine={false} axisLine={false} />
            <ReferenceLine y={0} stroke={COLORS.axis} strokeOpacity={0.35} />
            <Tooltip {...tooltipStyle} formatter={(v, _n, p) => [`${inr(Number(v))} · ${p.payload.count} trades`, 'Net P&L']} />
            <Bar dataKey="net" radius={[6, 6, 6, 6]} maxBarSize={34}>
              {data.map((d) => <Cell key={d.name} fill={`url(#${id}${d.net >= 0 ? 'u' : 'd'})`} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
