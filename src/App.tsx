import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { db, useSettings, useTrades } from './lib/db'
import { calcTrade } from './lib/calc'
import { summarize, type Row } from './lib/stats'
import { chronological, symbolBoard } from './lib/insights'
import { localDate, weekDays, weekStart } from './lib/week'
import { nseStatus } from './lib/market'
import { inr, pct, pnlColor } from './lib/format'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import Insights from './pages/Insights'
import Weekly from './pages/Weekly'
import SettingsPage from './pages/SettingsPage'
import Ticker, { type Tick } from './components/Ticker'
import CommandPalette, { type Command } from './components/CommandPalette'
import Toaster from './components/Toaster'
import AnimatedNumber from './components/AnimatedNumber'
import {
  IconDashboard, IconInsights, IconLogo, IconMoon, IconPlus, IconSearch, IconSettings, IconSun, IconTrades, IconWeekly,
} from './components/Icons'

const links = [
  { to: '/', label: 'Dashboard', Icon: IconDashboard },
  { to: '/trades', label: 'Trades', Icon: IconTrades },
  { to: '/weekly', label: 'Weekly', Icon: IconWeekly },
  { to: '/insights', label: 'Insights', Icon: IconInsights },
  { to: '/settings', label: 'Settings', Icon: IconSettings },
]

const signed = (n: number) => (n > 0 ? '+' : '') + inr(n)
const tone = (n: number) => (n > 0 ? 'up' : n < 0 ? 'down' : 'muted') as Tick['tone']
const isTyping = (el: EventTarget | null) => {
  const e = el as HTMLElement | null
  return !!e && (e.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName))
}

export default function App() {
  const navigate = useNavigate()
  const [settings, saveSettings] = useSettings()
  const { trades, loading, refresh } = useTrades()
  const [palette, setPalette] = useState(false)
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('tj-dark') !== '0' } catch { return true }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('tj-dark', dark ? '1' : '0') } catch { /* ignore */ }
  }, [dark])

  const rows: Row[] = useMemo(
    () => trades.map((trade) => ({ trade, res: calcTrade(trade, settings.rates) })),
    [trades, settings.rates],
  )
  const todayKey = localDate()
  const today = useMemo(() => summarize(rows.filter((r) => r.trade.date === todayKey)), [rows, todayKey])

  const addTrade = useCallback(() => navigate('/trades', { state: { add: Date.now() } }), [navigate])

  // Global shortcuts: ⌘/Ctrl+K palette, N new trade, / search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); return }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('[role=dialog]')) return
      if (e.key === 'n') { e.preventDefault(); addTrade() }
      else if (e.key === '/') { e.preventDefault(); setPalette(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addTrade])

  const ticker: Tick[] = useMemo(() => {
    if (!rows.length) return []
    const week = weekDays(weekStart(todayKey))
    const month = todayKey.slice(0, 7)
    const net = (f: (d: string) => boolean) => rows.filter((r) => f(r.trade.date)).reduce((s, r) => s + r.res.net, 0)
    const all = summarize(rows)
    const status = nseStatus()
    const top = symbolBoard(rows.filter((r) => r.trade.date.startsWith(month)))
    const w = net((d) => week.includes(d))
    const mo = net((d) => d.startsWith(month))
    const items: Tick[] = [
      { label: 'NSE', value: status.label, tone: status.open ? 'up' : 'muted' },
      { label: 'Today', value: signed(today.net), tone: tone(today.net), arrow: true },
      { label: 'Week', value: signed(w), tone: tone(w), arrow: true },
      { label: 'Month', value: signed(mo), tone: tone(mo), arrow: true },
      { label: 'Win rate', value: pct(all.winRate) },
      { label: 'Profit factor', value: Number.isFinite(all.profitFactor) ? all.profitFactor.toFixed(2) : '∞' },
      { label: 'Expectancy', value: `${signed(all.expectancy)}/trade`, tone: tone(all.expectancy) },
    ]
    if (top[0]?.net > 0) items.push({ label: `Top · ${top[0].symbol}`, value: signed(top[0].net), tone: 'up' })
    const worst = top[top.length - 1]
    if (worst?.net < 0) items.push({ label: `Weakest · ${worst.symbol}`, value: signed(worst.net), tone: 'down' })
    for (const r of chronological(rows).slice(-10).reverse())
      items.push({ label: r.trade.symbol, value: signed(r.res.net), tone: tone(r.res.net), arrow: true })
    return items
  }, [rows, today.net, todayKey])

  const commands: Command[] = useMemo(() => {
    const go = (to: string, state?: object) => () => navigate(to, state ? { state } : undefined)
    const symbols = [...new Set(trades.map((t) => t.symbol))].sort()
    return [
      { id: 'add', group: 'Actions', label: 'Add a new trade', hint: 'N', icon: <IconPlus />, run: addTrade },
      { id: 'theme', group: 'Actions', label: `Switch to ${dark ? 'light' : 'dark'} theme`, icon: dark ? <IconSun /> : <IconMoon />, run: () => setDark((d) => !d) },
      ...links.map((l) => ({ id: `nav${l.to}`, group: 'Go to', label: l.label, icon: <l.Icon />, run: go(l.to) })),
      ...symbols.map((s) => ({ id: `sym${s}`, group: 'Symbols', label: `${s} trades`, icon: <span className="text-[10px] font-bold">{s.slice(0, 2)}</span>, run: go('/trades', { q: s }) })),
    ]
  }, [trades, dark, addTrade, navigate])

  // Trades saved before the app became intraday-only.
  const legacy = trades.filter((t) => (t as { type?: string }).type === 'Delivery')
  const removeLegacy = async () => {
    if (!confirm(`Delete ${legacy.length} delivery trade(s)? This cannot be undone (export a backup first if unsure).`)) return
    await db.trades.bulkDelete(legacy.map((t) => t.id!))
    refresh()
  }

  const themeBtn = (
    <button className="btn-ghost !px-2.5" onClick={() => setDark((d) => !d)} aria-label="Toggle theme" title="Toggle theme">
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  )

  return (
    <div className="min-h-screen md:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line/70 bg-panel/55 p-4 backdrop-blur-2xl md:flex">
        <div className="mb-5 flex items-center gap-3 px-1">
          <IconLogo />
          <div className="leading-tight">
            <div className="font-display text-[15px] font-semibold tracking-tight">Trade<span className="text-brand">Desk</span></div>
            <div className="text-[11px] text-muted">NSE intraday journal</div>
          </div>
        </div>

        <button className="btn mb-2 w-full !justify-between" onClick={addTrade}>
          <span className="flex items-center gap-2"><IconPlus /> New trade</span>
          <span className="rounded-md bg-white/20 px-1.5 font-mono text-[10px]">N</span>
        </button>
        <button onClick={() => setPalette(true)} className="mb-5 flex w-full items-center gap-2 rounded-xl border border-line bg-panel2/50 px-3 py-2 text-sm text-muted transition hover:border-accent/50 hover:text-fg">
          <IconSearch /> <span className="flex-1 text-left">Search…</span> <span className="kbd">⌘K</span>
        </button>

        <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/80">Menu</div>
        <nav className="flex flex-1 flex-col gap-1">
          {links.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive
                  ? 'bg-gradient-to-r from-accent/20 to-accent/0 font-medium text-fg'
                  : 'text-muted hover:bg-panel2/70 hover:text-fg'}`}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute -left-4 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_14px_var(--accent)]" />}
                  <span className={isActive ? 'text-accent' : ''}><Icon /></span> {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-panel2/60 p-3.5">
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl"
              style={{ background: `color-mix(in srgb, var(${today.net >= 0 ? '--up' : '--down'}) 30%, transparent)` }} />
            <div className="label !mb-1">Today</div>
            <div className={`num text-2xl font-semibold ${pnlColor(today.net)} ${today.net > 0 ? 'glow-up' : today.net < 0 ? 'glow-down' : ''}`}>
              <AnimatedNumber value={today.net} format={signed} />
            </div>
            <div className="mt-1 text-xs text-muted">{today.count} {today.count === 1 ? 'trade' : 'trades'}{today.count ? ` · ${today.winRate.toFixed(0)}% win` : ''}</div>
            {today.count > 0 && (
              <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-down/40">
                <div className="h-full rounded-full bg-up" style={{ width: `${today.winRate}%` }} />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            {themeBtn}
            <span className="text-[11px] text-muted">v1 · local only</span>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/70 bg-panel/70 px-4 py-2.5 backdrop-blur-2xl md:hidden">
        <div className="flex items-center gap-2.5"><IconLogo size={30} /><span className="font-display text-sm font-semibold">Trade<span className="text-brand">Desk</span></span></div>
        <div className="flex items-center gap-2">
          <span className={`num mr-1 text-sm font-semibold ${pnlColor(today.net)}`}>{signed(today.net)}</span>
          <button className="btn-ghost !px-2.5" onClick={() => setPalette(true)} aria-label="Search"><IconSearch /></button>
          {themeBtn}
        </div>
      </header>

      <Ticker items={ticker} />

      <main className="mx-auto max-w-7xl px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-12">
        {legacy.length > 0 && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/50 bg-warn/10 p-3 text-sm">
            <span>{legacy.length} saved trade(s) were marked Delivery. This app is now intraday-only, so their charges are calculated as intraday and will be wrong.</span>
            <button className="btn-ghost" onClick={removeLegacy}>Delete them</button>
          </div>
        )}
        {loading ? <p className="text-sm text-muted">Loading…</p> : (
          <div className="page">
            <Routes>
              <Route path="/" element={<Dashboard rows={rows} settings={settings} onAdd={addTrade} />} />
              <Route path="/trades" element={<Trades rows={rows} settings={settings} refresh={refresh} />} />
              <Route path="/weekly" element={<Weekly rows={rows} settings={settings} />} />
              <Route path="/insights" element={<Insights rows={rows} settings={settings} save={saveSettings} />} />
              <Route path="/settings" element={<SettingsPage rows={rows} settings={settings} save={saveSettings} refresh={refresh} />} />
            </Routes>
          </div>
        )}
      </main>

      {/* Mobile: floating add + bottom nav */}
      <button onClick={addTrade} aria-label="Add trade"
        className="btn fixed bottom-20 right-4 z-30 !h-14 !w-14 !rounded-2xl !p-0 md:hidden"><IconPlus /></button>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line/70 bg-panel/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden">
        {links.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] transition ${isActive ? 'text-accent' : 'text-muted'}`}>
            <Icon /> {label}
          </NavLink>
        ))}
      </nav>

      <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />
      <Toaster />
    </div>
  )
}
