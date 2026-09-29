import type { ReactNode } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="border-b border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800">{title}</h2>
      {children}
    </section>
  )
}

export function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="card">
      <h3 className="text-sm font-medium">{title}</h3>
      {note && <p className="mb-2 text-xs text-slate-500">{note}</p>}
      <div className={note ? '' : 'mt-2'}>{children}</div>
    </div>
  )
}

export const Empty = ({ children = 'Not enough data yet.' }: { children?: ReactNode }) => (
  <p className="py-6 text-center text-sm text-slate-500">{children}</p>
)

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500">
          <tr>{head.map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
              {r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1.5">{c}</td>)}
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
        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
        <Tooltip formatter={(v) => [String(v), 'Trades']} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((d) => <Cell key={d.name} fill={d.positive ? '#10b981' : '#f43f5e'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export const mins = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)}m`)
