import { useMemo, useState } from 'react'
import type { Settings, Trade } from '../lib/types'
import type { Row } from '../lib/stats'
import { db } from '../lib/db'
import TradeForm from '../components/TradeForm'
import { inr, pnlColor } from '../lib/format'

interface Props { rows: Row[]; settings: Settings; refresh: () => void }

export default function Trades({ rows, settings, refresh }: Props) {
  const [editing, setEditing] = useState<Trade | null>(null)
  const [q, setQ] = useState('')
  const [setup, setSetup] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [viewing, setViewing] = useState<string[] | null>(null)

  const shown = useMemo(
    () =>
      rows
        .filter(({ trade: t }) =>
          (!q || t.symbol.includes(q.toUpperCase())) &&
          (!setup || t.setup === setup) && (!from || t.date >= from) && (!to || t.date <= to))
        .sort((a, b) => b.trade.date.localeCompare(a.trade.date) || (b.trade.id ?? 0) - (a.trade.id ?? 0)),
    [rows, q, setup, from, to],
  )

  const save = async (t: Trade) => {
    if (t.id != null) await db.trades.put(t)
    else await db.trades.add(t)
    setEditing(null)
    refresh()
  }
  const remove = async (id: number) => {
    if (!confirm('Delete this trade?')) return
    await db.trades.delete(id)
    refresh()
  }

  return (
    <div className="space-y-4">
      {editing ? (
        <TradeForm key={editing.id} settings={settings} rows={rows} initial={editing} onSave={save} onCancel={() => setEditing(null)} />
      ) : (
        <TradeForm settings={settings} rows={rows} onSave={save} />
      )}

      <div className="card">
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <input className="input" placeholder="Search symbol" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={setup} onChange={(e) => setSetup(e.target.value)}><option value="">All setups</option>{settings.setups.map((s) => <option key={s}>{s}</option>)}</select>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </div>
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{rows.length ? 'No trades match the filters.' : 'No trades yet. Add your first one above.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>{['Date', 'Symbol', 'Side', 'Qty', 'Entry', 'Exit', 'Charges', 'Net P&L', 'R', 'Setup', ''].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map(({ trade: t, res }) => (
                  <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800" title={t.notes}>
                    <td className="px-2 py-2 whitespace-nowrap">{t.date}</td>
                    <td className="px-2 py-2 font-medium">{t.symbol}{!t.followedPlan && <span className="ml-1 text-amber-500" title="Did not follow plan">⚠</span>}{!!t.screenshots?.length && <button className="ml-1" title="View screenshots" aria-label="View screenshots" onClick={() => setViewing(t.screenshots!)}>📷</button>}</td>
                    <td className="px-2 py-2">{t.side}</td>
                    <td className="px-2 py-2">{t.qty}</td>
                    <td className="px-2 py-2">{t.entryPrice}</td>
                    <td className="px-2 py-2">{t.exitPrice}</td>
                    <td className="px-2 py-2">{inr(res.charges.total, 2)}</td>
                    <td className={`px-2 py-2 font-medium ${pnlColor(res.net)}`}>{inr(res.net, 2)}</td>
                    <td className="px-2 py-2">{res.rMultiple ?? '–'}</td>
                    <td className="px-2 py-2">{t.setup}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <button className="text-indigo-600 hover:underline" onClick={() => { setEditing(t); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
                      <button className="ml-3 text-rose-600 hover:underline" onClick={() => remove(t.id!)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/70 p-4" onClick={() => setViewing(null)}>
          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
            {viewing.map((src, i) => <img key={i} src={src} alt={`Screenshot ${i + 1}`} className="max-w-full rounded" />)}
            <button className="btn" onClick={() => setViewing(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
