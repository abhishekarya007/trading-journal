import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { inr } from '../lib/format'
import { axisTick, COLORS, tooltipStyle } from '../lib/theme'

export default function BarPnl({ title, data }: { title: string; data: { name: string; net: number; count: number }[] }) {
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {data.length === 0 ? <p className="py-8 text-center text-sm text-muted">No data</p> : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis tick={axisTick} width={50} tickLine={false} axisLine={false} />
            <Tooltip {...tooltipStyle} formatter={(v, _n, p) => [`${inr(Number(v))} (${p.payload.count} trades)`, 'Net P&L']} />
            <Bar dataKey="net" radius={[4, 4, 0, 0]} maxBarSize={38}>
              {data.map((d) => <Cell key={d.name} fill={d.net >= 0 ? COLORS.up : COLORS.down} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
