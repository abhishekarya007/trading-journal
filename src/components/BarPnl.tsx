import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { inr } from '../lib/format'

export default function BarPnl({ title, data }: { title: string; data: { name: string; net: number; count: number }[] }) {
  return (
    <div className="card">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {data.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No data</p> : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={50} />
            <Tooltip formatter={(v, _n, p) => [`${inr(Number(v))} (${p.payload.count} trades)`, 'Net P&L']} />
            <Bar dataKey="net" radius={[3, 3, 0, 0]}>
              {data.map((d) => <Cell key={d.name} fill={d.net >= 0 ? '#10b981' : '#f43f5e'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
