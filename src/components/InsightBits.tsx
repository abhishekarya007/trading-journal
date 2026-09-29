import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisTick, COLORS, tooltipStyle } from '../lib/theme'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted"><span className="h-3.5 w-1 rounded bg-accent" />{title}<span className="h-px flex-1 bg-line" /></h2>
      {children}
    </section>
  )
}

export function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold">{title}</h3>
      {note && <p className="mb-3 mt-0.5 text-xs text-muted">{note}</p>}
      <div className={note ? '' : 'mt-2'}>{children}</div>
    </div>
  )
}

export const Empty = ({ children = 'Not enough data yet.' }: { children?: ReactNode }) => (
  <p className="py-6 text-center text-sm text-muted">{children}</p>
)

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-muted">
          <tr>{head.map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => <td key={j} className={`whitespace-nowrap px-2 py-2 ${typeof c === 'number' ? 'num' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CountBars({ data }: { data: { name: string; count: number; positive: boolean }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="name" tick={{ ...axisTick, fontSize: 10 }} interval={0} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={axisTick} width={30} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v) => [String(v), 'Trades']} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={38}>
          {data.map((d) => <Cell key={d.name} fill={d.positive ? COLORS.up : COLORS.down} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export const mins = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)}m`)
