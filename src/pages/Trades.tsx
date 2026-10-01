import { Fragment, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Settings, Trade } from '../lib/types'
import type { Row } from '../lib/stats'
import { db } from '../lib/db'
import TradeForm from '../components/TradeForm'
import TradeDetail from '../components/TradeDetail'
import Modal from '../components/Modal'
import { inr, pnlColor } from '../lib/format'
import PageTitle from '../components/PageTitle'
import { IconCopy, IconEdit, IconPlus, IconSearch, IconTrash } from '../components/Icons'
import { summarize } from '../lib/stats'
import { groupByDay } from '../lib/habits'
import { toast } from '../lib/toast'
import { playFeedback } from '../lib/feedback'
import { savedOutcome } from '../lib/tradeEvents'
import { calcTrade } from '../lib/calc'
import { readCooldown, remainingMs, startCooldown } from '../lib/cooldown'
import { downloadText, tradesToCsv } from '../lib/csv'
import { duplicateTemplate } from '../lib/tradeText'
import { addDays, localDate, weekDays, weekStart } from '../lib/week'

const signed = (n: number) => (n > 0 ? '+' : '') + inr(n)

interface Props { rows: Row[]; settings: Settings; refresh: () => void }

type Quick = 'all' | 'today' | 'week' | 'month' | 'wins' | 'losses' | 'broke'
const QUICK: { id: Quick; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'wins', label: 'Wins' },
  { id: 'losses', label: 'Losses' },
  { id: 'broke', label: 'Broke plan' },
]

const GROUP_KEY = 'tj-grouped'
const num2 = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed2 = (n: number) => (n > 0 ? '+' : '') + num2(n)
const clock = (t?: string) => (t ? t.padStart(5, '0') : '')

const HEAD: { label: string; w?: string; right?: boolean; hide?: boolean }[] = [
  { label: 'Date', w: 'w-[1%]' }, { label: 'Symbol', w: 'w-[1%]' }, { label: 'Side', w: 'w-[1%]' }, { label: 'Time', w: 'w-[1%]' },
  { label: 'Qty', w: 'w-[1%]', right: true }, { label: 'Entry', w: 'w-[1%]', right: true }, { label: 'Exit', w: 'w-[1%]', right: true },
  { label: 'Charges ₹', w: 'w-[1%]', right: true }, { label: 'Net P&L ₹', w: 'w-[1%]', right: true }, { label: 'R', w: 'w-[1%]', right: true },
  { label: 'Setup' }, // takes the remaining width
  { label: 'Actions', w: 'w-[1%]', right: true, hide: true },
]

// One cell padding everywhere: 12px sides line the text up with the toolbar above; 8px top/bottom keeps rows thin but readable.
const TD = 'px-3 py-2'
// Numeric columns get extra room on their left so neighbouring numbers never run together.
const TDR = 'py-2 pl-6 pr-3'

function dayLabel(date: string, today: string) {
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...(y !== Number(today.slice(0, 4)) ? { year: 'numeric' } : {}) })
}

export default function Trades({ rows, settings, refresh }: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Trade | null>(null)
  const [prefill, setPrefill] = useState<Trade | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [setup, setSetup] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [quick, setQuick] = useState<Quick>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [menuFor, setMenuFor] = useState<number | null>(null) // phone list: which row's "⋯" menu is open
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [grouped, setGrouped] = useState(() => {
    try { return localStorage.getItem(GROUP_KEY) === '1' } catch { return false }
  })
  const location = useLocation()
  const navigate = useNavigate()
  const today = localDate()

  // Deep links from the dashboard, command palette and N shortcut.
  useEffect(() => {
    const st = location.state as { add?: number; open?: number; q?: string; prefill?: { side: Trade['side']; qty: number; entry: number; stop?: number; target?: number } } | null
    if (!st) return
    if (st.add) { setEditing(null); setPrefill(null); setFormOpen(true) }
    if (st.open) setDetailId(st.open)
    if (st.prefill) {
      const f = st.prefill
      setEditing(null)
      setPrefill({
        date: localDate(), symbol: '', side: f.side, qty: f.qty, entryPrice: f.entry, exitPrice: 0, stopLoss: f.stop, target: f.target,
        setup: settings.setups[0] ?? '', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '',
      })
      setFormOpen(true)
    }
    if (st.q) { setQ(st.q); setSetup(''); setFrom(''); setTo(''); setQuick('all') }
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate, settings.setups])

  // Filters typed in the boxes, before the quick chips.
  const base = useMemo(
    () =>
      rows
        .filter(({ trade: t }) =>
          (!q || t.symbol.includes(q.toUpperCase())) &&
          (!setup || t.setup === setup) && (!from || t.date >= from) && (!to || t.date <= to))
        .sort((a, b) => b.trade.date.localeCompare(a.trade.date) || (b.trade.id ?? 0) - (a.trade.id ?? 0)),
    [rows, q, setup, from, to],
  )
  const matchesQuick = useMemo(() => {
    const week = weekDays(weekStart(today))
    return {
      all: () => true,
      today: (r: Row) => r.trade.date === today,
      week: (r: Row) => week.includes(r.trade.date),
      month: (r: Row) => r.trade.date.startsWith(today.slice(0, 7)),
      wins: (r: Row) => r.res.net > 0,
      losses: (r: Row) => r.res.net < 0,
      broke: (r: Row) => !r.trade.followedPlan,
    } satisfies Record<Quick, (r: Row) => boolean>
  }, [today])
  const counts = useMemo(() => Object.fromEntries(QUICK.map((c) => [c.id, base.filter(matchesQuick[c.id]).length])) as Record<Quick, number>, [base, matchesQuick])
  const shown = useMemo(() => base.filter(matchesQuick[quick]), [base, matchesQuick, quick])
  const days = useMemo(() => groupByDay(shown), [shown])

  const sum = useMemo(() => summarize(shown), [shown])
  const detailIndex = detailId === null ? -1 : shown.findIndex((r) => r.trade.id === detailId)
  const detailRow = detailIndex >= 0 ? shown[detailIndex] : null
  const anyFilter = !!(q || setup || from || to) || quick !== 'all'
  const activeExtra = [setup, from, to].filter(Boolean).length
  const filtersOpen = showFilters || activeExtra > 0

  const openAdd = () => { setEditing(null); setPrefill(null); setFormOpen(true) }
  const openEdit = (t: Trade) => { setEditing(t); setPrefill(null); setFormOpen(true) }
  const openDuplicate = (t: Trade) => { setEditing(null); setPrefill(duplicateTemplate(t, localDate())); setFormOpen(true) }
  const closeForm = () => { setFormOpen(false); setEditing(null); setPrefill(null) }

  const save = async (t: Trade) => {
    if (t.id == null) {
      const outcome = savedOutcome(rows, t, settings)
      const id = await db.trades.add(t)
      closeForm()
      refresh()
      // One sound for what the trade did to your day, instead of the generic confirmation sound.
      playFeedback(outcome.result === 'win' ? 'win' : outcome.result === 'loss' ? 'loss' : 'info')
      toast(`${t.symbol} ${signed(outcome.net)} · day ${signed(outcome.dayNet)}`, outcome.result === 'loss' ? 'info' : 'success', {
        silent: true,
        action: { label: 'Undo', run: async () => { await db.trades.delete(id); refresh(); toast('Trade removed', 'info') } },
      })
      if (outcome.goalReached) {
        setTimeout(() => { playFeedback('goal'); toast('🎯 Monthly profit goal reached', 'success', { silent: true, duration: 5000 }) }, 600)
      } else if (outcome.newWarnings.length) {
        setTimeout(() => { playFeedback('limit'); toast(outcome.newWarnings[0].message, 'info', { silent: true, duration: 7000 }) }, 600)
      }
      // A fresh loss: offer a break before the next trade (unless one is already running).
      const net = calcTrade(t, settings.rates).net
      if (net < 0 && t.date === localDate() && settings.cooldown.offerAfterLoss && remainingMs(readCooldown(), Date.now()) === 0) {
        setTimeout(() => toast(`That trade lost ${inr(-net)}. Take a ${settings.cooldown.minutes}-minute cooldown before the next one?`, 'info', {
          action: { label: 'Start cooldown', run: () => { startCooldown(settings.cooldown.minutes) } }, duration: 12000,
        }), 500)
      }
    } else {
      const before = rows.find((r) => r.trade.id === t.id)?.trade
      await db.trades.put(t)
      closeForm()
      refresh()
      toast(`${t.symbol} trade updated`, 'success', before ? {
        action: { label: 'Undo', run: async () => { await db.trades.put(before); refresh(); toast('Change undone', 'info') } },
      } : {})
    }
  }
  const remove = async (id: number) => {
    const trade = rows.find((r) => r.trade.id === id)?.trade
    if (!trade) return
    await db.trades.delete(id)
    if (detailId === id) setDetailId(null)
    refresh()
    toast(`${trade.symbol} trade deleted`, 'info', {
      action: { label: 'Undo', run: async () => { await db.trades.put(trade); refresh(); toast('Trade restored') } },
    })
  }

  const toggleDay = (date: string) =>
    setCollapsed((c) => { const n = new Set(c); if (n.has(date)) n.delete(date); else n.add(date); return n })
  const allCollapsed = days.length > 0 && days.every((d) => collapsed.has(d.date))
  const setGroupedPref = (v: boolean) => {
    setGrouped(v)
    try { localStorage.setItem(GROUP_KEY, v ? '1' : '0') } catch { /* ignore */ }
  }
  useEffect(() => {
    if (menuFor === null) return
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[role=menu], [aria-haspopup=menu]')) setMenuFor(null) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menuFor])
  const exportCsv = () => {
    if (!shown.length) return
    // oldest first reads best in a spreadsheet
    downloadText(`trades-${anyFilter ? 'filtered-' : ''}${localDate()}.csv`, tradesToCsv([...shown].reverse()))
    toast(`${shown.length} trade${shown.length === 1 ? '' : 's'} exported to CSV`)
  }
  const clearFilters = () => { setQ(''); setSetup(''); setFrom(''); setTo(''); setQuick('all') }

  const sideText = (t: Trade) => <span className={t.side === 'Long' ? 'text-up' : 'text-down'}>{t.side}</span>
  const flags = (t: Trade) => (
    <>
      {!t.followedPlan && <span className="ml-1 text-warn" title="Did not follow plan">⚠</span>}
      {!!t.screenshots?.length && <span className="ml-1" title="Has screenshots">📷</span>}
    </>
  )

  // One thin line per trade, every column visible.
  const tradeRow = ({ trade: t, res }: Row, newDay: boolean) => (
    <tr key={t.id} tabIndex={0} aria-label={`Open ${t.symbol} trade on ${t.date}`}
      className={`cursor-pointer transition-colors odd:bg-panel2/25 hover:!bg-accent/10 ${newDay ? 'border-t border-line' : ''}`}
      onClick={() => setDetailId(t.id!)}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setDetailId(t.id!) }}>
      <td className={`num whitespace-nowrap ${TD} text-muted`}>{t.date}</td>
      <td className={`whitespace-nowrap ${TD} font-semibold tracking-wide`}>{t.symbol}{flags(t)}</td>
      <td className={`whitespace-nowrap ${TD}`}>{sideText(t)}</td>
      <td className={`num whitespace-nowrap ${TD} text-muted`}>{clock(t.entryTime) || '–'}</td>
      <td className={`num ${TDR} text-right`}>{t.qty}</td>
      <td className={`num ${TDR} text-right`}>{num2(t.entryPrice)}</td>
      <td className={`num ${TDR} text-right`}>{num2(t.exitPrice)}</td>
      <td className={`num ${TDR} text-right text-muted`}>{num2(res.charges.total)}</td>
      <td className={`num ${TDR} text-right font-semibold ${pnlColor(res.net)}`}>{signed2(res.net)}</td>
      <td className={`num ${TDR} text-right ${res.rMultiple === null ? 'text-muted' : pnlColor(res.rMultiple)}`}>{res.rMultiple ?? '–'}</td>
      <td className={`whitespace-nowrap ${TD} text-muted`}>{t.setup}</td>
      <td className="whitespace-nowrap py-1 pl-2 pr-3 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="inline-flex items-center">
          <button type="button" className="rowbtn" title="Edit" aria-label={`Edit ${t.symbol} trade on ${t.date}`} onClick={() => openEdit(t)}><IconEdit /></button>
          <button type="button" className="rowbtn" title="Duplicate" aria-label={`Duplicate ${t.symbol} trade on ${t.date}`} onClick={() => openDuplicate(t)}><IconCopy /></button>
          <button type="button" className="rowbtn rowbtn-danger" title="Delete" aria-label={`Delete ${t.symbol} trade on ${t.date}`} onClick={() => remove(t.id!)}><IconTrash /></button>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="space-y-4">
      <PageTitle title="Trades" sub="Log every trade, with charges calculated for you">
        <button className="btn" onClick={openAdd}><IconPlus /> Add trade <span className="rounded-md bg-white/20 px-1.5 font-mono text-[10px]">N</span></button>
      </PageTitle>

      <div className="card !p-0">
        {/* Toolbar */}
        <div className="space-y-3 p-4 pb-3 md:p-5 md:pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><IconSearch /></span>
              <input className="input !pl-10" placeholder="Search symbol…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search symbol" />
            </div>
            <button type="button" className="btn-ghost" aria-expanded={filtersOpen} onClick={() => setShowFilters((v) => !v)}>
              Filters{activeExtra > 0 && <span className="rounded-full bg-accent/25 px-1.5 text-[11px] font-semibold text-accent">{activeExtra}</span>}
            </button>
            <button type="button" className="btn-ghost" onClick={exportCsv} disabled={!shown.length} title={`Download the ${shown.length} trades shown as a CSV file for Excel or Google Sheets`}>Export CSV</button>
            {anyFilter && <button type="button" className="text-xs text-accent hover:underline" onClick={clearFilters}>Clear</button>}
          </div>

          {filtersOpen && (
            <div className="rise grid grid-cols-2 gap-2 md:grid-cols-3">
              <select className="input col-span-2 md:col-span-1" value={setup} onChange={(e) => setSetup(e.target.value)} aria-label="Setup"><option value="">All setups</option>{settings.setups.map((s) => <option key={s}>{s}</option>)}</select>
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            </div>
          )}

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Quick filters">
            {QUICK.map((c) => (
              <button key={c.id} type="button" aria-pressed={quick === c.id} onClick={() => setQuick(c.id)}
                className={`chip shrink-0 transition hover:border-accent/60 ${quick === c.id ? '!border-accent !bg-accent/15 !text-fg' : ''}`}>
                {c.label} <b className="num">{counts[c.id]}</b>
              </button>
            ))}
          </div>

          {shown.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="text-xs text-muted">
                {shown.length} {shown.length === 1 ? 'trade' : 'trades'} · {days.length} {days.length === 1 ? 'day' : 'days'}
                {' · '}Net <b className={`num ${pnlColor(sum.net)}`}>{sum.net > 0 ? '+' : ''}{inr(sum.net)}</b>
                {' · '}Win rate <b className="num text-fg">{sum.winRate.toFixed(1)}%</b>
                {' · '}Charges <b className="num text-fg">{inr(sum.charges)}</b>
              </p>
              <div className="hidden items-center gap-2 md:flex">
                {grouped && (
                  <button type="button" className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(days.map((d) => d.date)))}>
                    {allCollapsed ? 'Expand days' : 'Collapse days'}
                  </button>
                )}
                <div className="seg" role="group" aria-label="Group trades by day">
                  <button aria-pressed={!grouped} onClick={() => setGroupedPref(false)}>List</button>
                  <button aria-pressed={grouped} onClick={() => setGroupedPref(true)}>By day</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="px-4 pb-10 pt-6 text-center text-sm text-muted">
            {rows.length === 0 ? 'No trades yet. Click “Add trade” to log your first one.' : 'No trades match these filters.'}
            {rows.length > 0 && anyFilter && <div><button type="button" className="btn-ghost mt-3" onClick={clearFilters}>Clear filters</button></div>}
          </div>
        ) : (
          <>
            {/* Desktop / tablet: dense spreadsheet */}
            <div className="hidden overflow-x-auto pb-3 md:block md:px-2">
              <table className="w-full text-[13px]">
                <thead className="text-[11px] uppercase tracking-wider text-muted">
                  <tr className="border-b border-line">
                    {HEAD.map((h) => <th key={h.label} className={`whitespace-nowrap py-2.5 font-medium ${h.w ?? ''} ${h.right ? 'pl-6 pr-3 text-right' : 'px-3 text-left'}`}>{h.hide ? <span className="sr-only">{h.label}</span> : h.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {grouped
                    ? days.map((day) => {
                      const open = !collapsed.has(day.date)
                      return (
                        <Fragment key={day.date}>
                          <tr className="day-row cursor-pointer border-t border-line bg-panel2/60" onClick={() => toggleDay(day.date)}>
                            <td colSpan={HEAD.length} className="px-3 py-1.5">
                              <div className="flex items-center gap-3 text-xs">
                                <span className={`inline-block w-3 text-muted transition ${open ? 'rotate-90' : ''}`}>›</span>
                                <span className="font-semibold">{dayLabel(day.date, today)}</span>
                                <span className="text-muted">{day.count} {day.count === 1 ? 'trade' : 'trades'}</span>
                                <span className={`num ml-auto font-semibold ${pnlColor(day.net)}`}>{signed2(day.net)}</span>
                              </div>
                            </td>
                          </tr>
                          {open && day.rows.map((r) => tradeRow(r, false))}
                        </Fragment>
                      )
                    })
                    : shown.map((r, i) => tradeRow(r, i > 0 && shown[i - 1].trade.date !== r.trade.date))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-semibold">
                    <td colSpan={7} className="px-3 py-2.5 text-xs text-muted">Total · {shown.length} {shown.length === 1 ? 'trade' : 'trades'} · {sum.winRate.toFixed(1)}% won</td>
                    <td className="num py-2.5 pl-6 pr-3 text-right text-muted">{num2(sum.charges)}</td>
                    <td className={`num py-2.5 pl-6 pr-3 text-right ${pnlColor(sum.net)}`}>{signed2(sum.net)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Phone: compact list, no sideways scrolling */}
            <ul className="px-3 pb-3 md:hidden">
              {shown.map(({ trade: t, res }) => (
                <li key={t.id} className="relative border-b border-line/50">
                  <div className="flex items-center">
                    <button type="button" onClick={() => setDetailId(t.id!)} aria-label={`Open ${t.symbol} trade on ${t.date}`}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 px-1 py-2.5 text-left">
                      <div className="min-w-0">
                        <div className="font-semibold tracking-wide">{t.symbol}{flags(t)} <span className="text-[11px] font-normal">{sideText(t)}</span></div>
                        <div className="num truncate text-[11px] text-muted">{t.date}{t.entryTime ? ` ${clock(t.entryTime)}` : ''} · {t.qty} × {num2(t.entryPrice)} → {num2(t.exitPrice)}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`num font-semibold ${pnlColor(res.net)}`}>{signed2(res.net)}</div>
                        <div className="num text-[11px] text-muted">{res.rMultiple !== null ? `${res.rMultiple}R` : t.setup}</div>
                      </div>
                    </button>
                    <button type="button" className="rowbtn !h-9 !w-9 shrink-0 text-lg leading-none" aria-haspopup="menu" aria-expanded={menuFor === t.id}
                      aria-label={`Actions for ${t.symbol} trade on ${t.date}`} onClick={() => setMenuFor(menuFor === t.id ? null : t.id!)}>⋯</button>
                  </div>
                  {menuFor === t.id && (
                    <div role="menu" className="absolute right-1 top-11 z-20 w-44 overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-2xl">
                      <button role="menuitem" type="button" className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-panel2" onClick={() => { setMenuFor(null); openEdit(t) }}><IconEdit /> Edit</button>
                      <button role="menuitem" type="button" className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-panel2" onClick={() => { setMenuFor(null); openDuplicate(t) }}><IconCopy /> Duplicate</button>
                      <button role="menuitem" type="button" className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-down hover:bg-down/10" onClick={() => { setMenuFor(null); remove(t.id!) }}><IconTrash /> Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
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
