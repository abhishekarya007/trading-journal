import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Settings, Trade } from '../lib/types'
import type { Row } from '../lib/stats'
import { db } from '../lib/db'
import TradeForm from '../components/TradeForm'
import TradeDetail from '../components/TradeDetail'
import Modal from '../components/Modal'
import { inr, pnlColor } from '../lib/format'
import PageTitle from '../components/PageTitle'
import SymbolAvatar from '../components/SymbolAvatar'
import { IconPlus } from '../components/Icons'
import { summarize } from '../lib/stats'
import { toast } from '../lib/toast'
import { duplicateTemplate } from '../lib/tradeText'
import { localDate } from '../lib/week'

interface Props { rows: Row[]; settings: Settings; refresh: () => void }

export default function Trades({ rows, settings, refresh }: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Trade | null>(null)
  const [prefill, setPrefill] = useState<Trade | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [setup, setSetup] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  // Deep links from the dashboard, command palette and N shortcut.
  useEffect(() => {
    const st = location.state as { add?: number; open?: number; q?: string } | null
    if (!st) return
    if (st.add) { setEditing(null); setPrefill(null); setFormOpen(true) }
    if (st.open) setDetailId(st.open)
    if (st.q) { setQ(st.q); setSetup(''); setFrom(''); setTo('') }
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  const shown = useMemo(
    () =>
      rows
        .filter(({ trade: t }) =>
          (!q || t.symbol.includes(q.toUpperCase())) &&
          (!setup || t.setup === setup) && (!from || t.date >= from) && (!to || t.date <= to))
        .sort((a, b) => b.trade.date.localeCompare(a.trade.date) || (b.trade.id ?? 0) - (a.trade.id ?? 0)),
    [rows, q, setup, from, to],
  )

  const sum = useMemo(() => summarize(shown), [shown])
  const detailIndex = detailId === null ? -1 : shown.findIndex((r) => r.trade.id === detailId)
  const detailRow = detailIndex >= 0 ? shown[detailIndex] : null

  const openAdd = () => { setEditing(null); setPrefill(null); setFormOpen(true) }
  const openEdit = (t: Trade) => { setEditing(t); setPrefill(null); setFormOpen(true) }
  const openDuplicate = (t: Trade) => { setEditing(null); setPrefill(duplicateTemplate(t, localDate())); setFormOpen(true) }
  const closeForm = () => { setFormOpen(false); setEditing(null); setPrefill(null) }

  const save = async (t: Trade) => {
    const isNew = t.id == null
    if (isNew) await db.trades.add(t)
    else await db.trades.put(t)
    closeForm()
    refresh()
    toast(isNew ? `${t.symbol} trade added` : `${t.symbol} trade updated`)
  }
  const remove = async (id: number) => {
    if (!confirm('Delete this trade?')) return
    await db.trades.delete(id)
    if (detailId === id) setDetailId(null)
    refresh()
    toast('Trade deleted', 'info')
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Trades" sub="Log every trade, with charges calculated for you">
        <button className="btn" onClick={openAdd}><IconPlus /> Add trade <span className="rounded-md bg-white/20 px-1.5 font-mono text-[10px]">N</span></button>
      </PageTitle>

      <div className="card">
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <input className="input" placeholder="Search symbol" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={setup} onChange={(e) => setSetup(e.target.value)}><option value="">All setups</option>{settings.setups.map((s) => <option key={s}>{s}</option>)}</select>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </div>
        {shown.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="chip">{shown.length} trades</span>
            <span className="chip">Net <b className={`num ${pnlColor(sum.net)}`}>{sum.net > 0 ? '+' : ''}{inr(sum.net)}</b></span>
            <span className="chip">Win rate <b className="num text-fg">{sum.winRate.toFixed(1)}%</b></span>
            <span className="chip">Charges <b className="num text-fg">{inr(sum.charges)}</b></span>
          </div>
        )}
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{rows.length ? 'No trades match the filters.' : 'No trades yet. Click “Add trade” to log your first one.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted">
                <tr>{['Date', 'Symbol', 'Side', 'Qty', 'Entry', 'Exit', 'Charges', 'Net P&L', 'R', 'Setup', ''].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map(({ trade: t, res }) => (
                  <tr key={t.id} className="cursor-pointer border-t border-line" tabIndex={0} aria-label={`Open ${t.symbol} trade on ${t.date}`}
                    onClick={() => setDetailId(t.id!)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setDetailId(t.id!) }}>
                    <td className="px-2 py-2">{t.date}</td>
                    <td className="px-2 py-2 font-semibold tracking-wide">
                      <span className="mr-2.5 inline-block align-middle"><SymbolAvatar symbol={t.symbol} size={26} /></span>
                      {t.symbol}
                      {!t.followedPlan && <span className="ml-1 text-warn" title="Did not follow plan">⚠</span>}
                      {!!t.screenshots?.length && <span className="ml-1" title="Has screenshots">📷</span>}
                    </td>
                    <td className="px-2 py-2"><span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${t.side === 'Long' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>{t.side.toUpperCase()}</span></td>
                    <td className="num px-2 py-2">{t.qty}</td>
                    <td className="num px-2 py-2">{t.entryPrice}</td>
                    <td className="num px-2 py-2">{t.exitPrice}</td>
                    <td className="num px-2 py-2">{inr(res.charges.total, 2)}</td>
                    <td className={`num px-2 py-2 font-semibold ${pnlColor(res.net)}`}>{inr(res.net, 2)}</td>
                    <td className="num px-2 py-2">{res.rMultiple ?? '–'}</td>
                    <td className="px-2 py-2">{t.setup}</td>
                    <td className="px-2 py-2 text-right text-muted">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailRow && (
        <TradeDetail
          row={detailRow}
          settings={settings}
          position={{ index: detailIndex, total: shown.length }}
          onClose={() => setDetailId(null)}
          onEdit={() => openEdit(detailRow.trade)}
          onDelete={() => remove(detailRow.trade.id!)}
          onDuplicate={() => openDuplicate(detailRow.trade)}
          onPrev={detailIndex > 0 ? () => setDetailId(shown[detailIndex - 1].trade.id!) : undefined}
          onNext={detailIndex < shown.length - 1 ? () => setDetailId(shown[detailIndex + 1].trade.id!) : undefined}
        />
      )}

      {formOpen && (
        <Modal title={editing ? `Edit ${editing.symbol} trade` : prefill ? `Duplicate ${prefill.symbol} trade` : 'Add trade'} size="xl" z={60} closeOnBackdrop={false} onClose={closeForm}>
          <TradeForm key={editing?.id ?? (prefill ? 'copy' : 'new')} settings={settings} rows={rows} initial={editing ?? undefined} prefill={prefill ?? undefined} onSave={save} onCancel={closeForm} />
        </Modal>
      )}
    </div>
  )
}
