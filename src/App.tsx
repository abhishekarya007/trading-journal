import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
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
import Calculator from './pages/Calculator'
import Report from './pages/Report'
import SettingsPage from './pages/SettingsPage'
import Ticker, { type Tick } from './components/Ticker'
import CommandPalette, { type Command } from './components/CommandPalette'
import Toaster from './components/Toaster'
import { toast } from './lib/toast'
import BackupBadge from './components/BackupBadge'
import { milestones } from './lib/milestones'
import { backupStatus, downloadBackup, requestStorageProtection, useBackupInfo } from './lib/backup'
import { INSIGHT_TABS } from './pages/Insights'
import AnimatedNumber from './components/AnimatedNumber'
import {
  IconCalc, IconChevLeft, IconChevRight, IconReport, IconDashboard, IconInsights, IconLogo, IconMoon, IconPlus, IconSearch, IconSettings, IconSun, IconTrades, IconWeekly,
} from './components/Icons'

const links: { to: string; label: string; Icon: () => ReactElement; desktopOnly?: boolean }[] = [
  { to: '/', label: 'Dashboard', Icon: IconDashboard },
  { to: '/trades', label: 'Trades', Icon: IconTrades },
  { to: '/calculator', label: 'Calculator', Icon: IconCalc },
  { to: '/weekly', label: 'Weekly', Icon: IconWeekly },
  { to: '/insights', label: 'Insights', Icon: IconInsights },
  { to: '/report', label: 'Report', Icon: IconReport, desktopOnly: true },
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
  const path = useLocation().pathname
  const onTrades = path === '/trades'
  const [settings, saveSettings] = useSettings()
  const { trades, loading, refresh } = useTrades()
  const [palette, setPalette] = useState(false)
  // The sidebar can shrink to an icons-only rail to give pages more room. The choice is remembered.
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('tj-sidebar') === '1' } catch { return false } })
  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => { try { localStorage.setItem('tj-sidebar', c ? '0' : '1') } catch { /* ignore */ } return !c })
  }, [])
  const backupInfo = useBackupInfo()
  const autoTried = useRef(false)
  const protectTried = useRef(false)
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('tj-dark') !== '0' } catch { return true }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('tj-dark', dark ? '1' : '0') } catch { /* ignore */ }
  }, [dark])

  // Optional automatic weekly backup: once per session, only when one is due.
  useEffect(() => {
    if (loading || autoTried.current || !backupInfo.auto || trades.length === 0) return
    if (backupStatus(trades.length, backupInfo, Date.now()).state === 'ok') return
    autoTried.current = true
    downloadBackup(settings, trades.length).then((n) => toast(`Automatic backup saved: ${n}`)).catch(() => toast('Automatic backup failed', 'error'))
  }, [loading, trades.length, backupInfo, settings])

  // Once there is real data, ask the browser to protect it from being cleared to free disk space.
  useEffect(() => {
    if (loading || protectTried.current || trades.length < 3) return
    protectTried.current = true
    void requestStorageProtection()
  }, [loading, trades.length])

  const rows: Row[] = useMemo(
    () => trades.map((trade) => ({ trade, res: calcTrade(trade, settings.rates) })),
    [trades, settings.rates],
  )
  // New milestones get a toast. The first time this runs, what you have already reached is recorded silently.
  useEffect(() => {
    if (loading) return
    const reached = milestones(rows, settings, localDate().slice(0, 7)).filter((m) => m.achievedOn)
    let seen: string[] | null = null
    try { const raw = localStorage.getItem('tj-milestones-seen'); seen = raw ? (JSON.parse(raw) as string[]) : null } catch { seen = null }
    const save = (ids: string[]) => { try { localStorage.setItem('tj-milestones-seen', JSON.stringify(ids)) } catch { /* ignore */ } }
    if (seen === null) { save(reached.map((m) => m.id)); return }
    const fresh = reached.filter((m) => !seen!.includes(m.id))
    if (!fresh.length) return
    save([...new Set([...seen, ...reached.map((m) => m.id)])])
    fresh.slice(0, 3).forEach((m, i) => setTimeout(() => toast(`🏆 ${m.title}`, 'success', { action: { label: 'View', run: () => navigate('/insights?tab=progress') } }), i * 600))
  }, [loading, rows, settings, navigate])

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
      else if (e.key === '[') { e.preventDefault(); toggleSidebar() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addTrade, toggleSidebar])

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
      { id: 'sidebar', group: 'Actions', label: collapsed ? 'Expand the menu' : 'Collapse the menu to icons', hint: '[', icon: collapsed ? <IconChevRight /> : <IconChevLeft />, run: toggleSidebar },
      { id: 'theme', group: 'Actions', label: `Switch to ${dark ? 'light' : 'dark'} theme`, icon: dark ? <IconSun /> : <IconMoon />, run: () => setDark((d) => !d) },
      ...links.map((l) => ({ id: `nav${l.to}`, group: 'Go to', label: l.label, icon: <l.Icon />, run: go(l.to) })),
      ...INSIGHT_TABS.filter((t) => t.id !== 'overview').map((t) => ({ id: `ins${t.id}`, group: 'Go to', label: `Insights › ${t.label}`, icon: <IconInsights />, run: () => navigate(`/insights?tab=${t.id}`) })),
      ...symbols.map((s) => ({ id: `sym${s}`, group: 'Symbols', label: `${s} trades`, icon: <span className="text-[10px] font-bold">{s.slice(0, 2)}</span>, run: go('/trades', { q: s }) })),
    ]
  }, [trades, dark, addTrade, navigate, collapsed, toggleSidebar])

  // Trades saved before the app became intraday-only.
  const legacy = trades.filter((t) => (t as { type?: string }).type === 'Delivery')
  const removeLegacy = async () => {
    const removed = legacy
    await db.trades.bulkDelete(removed.map((t) => t.id!))
    refresh()
    toast(`${removed.length} delivery trade(s) deleted`, 'info', {
      action: { label: 'Undo', run: async () => { await db.trades.bulkPut(removed); refresh(); toast('Trades restored') } },
    })
  }

  const themeBtn = (
    <button className="btn-ghost !px-2.5" onClick={() => setDark((d) => !d)} aria-label="Toggle theme" title="Toggle theme">
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  )

  return (
    <div className={`app-shell min-h-screen transition-[padding] duration-200 ${collapsed ? 'md:pl-[4.75rem]' : 'md:pl-64'}`}>
      {/* Desktop sidebar (collapses to icons) */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line/70 bg-panel/55 backdrop-blur-2xl transition-[width] duration-200 md:flex ${collapsed ? 'w-[4.75rem] p-3' : 'w-64 p-4'}`}>
        <div className={`mb-5 flex items-center ${collapsed ? 'flex-col gap-3' : 'gap-3 px-1'}`}>
          <IconLogo />
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="font-display text-[15px] font-semibold tracking-tight">Trade<span className="text-brand">Desk</span></div>
              <div className="text-[11px] text-muted">NSE intraday journal</div>
            </div>
          )}
          <button type="button" className="rowbtn shrink-0" onClick={toggleSidebar} aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu to icons'} title={`${collapsed ? 'Expand' : 'Collapse'} the menu  ( [ )`}>
            {collapsed ? <IconChevRight /> : <IconChevLeft />}
          </button>
        </div>

        {collapsed ? (
          <>
            <button className="btn mb-2 !h-11 w-full !px-0" onClick={addTrade} title="New trade  ( N )" aria-label="New trade"><IconPlus /></button>
            <button onClick={() => setPalette(true)} title="Search  ( ⌘K )" aria-label="Search"
              className="mb-5 flex h-11 w-full items-center justify-center rounded-xl border border-line bg-panel2/50 text-muted transition hover:border-accent/50 hover:text-fg"><IconSearch /></button>
          </>
        ) : (
          <>
            <button className="btn mb-2 w-full !justify-between" onClick={addTrade}>
              <span className="flex items-center gap-2"><IconPlus /> New trade</span>
              <span className="rounded-md bg-white/20 px-1.5 font-mono text-[10px]">N</span>
            </button>
            <button onClick={() => setPalette(true)} className="mb-5 flex w-full items-center gap-2 rounded-xl border border-line bg-panel2/50 px-3 py-2 text-sm text-muted transition hover:border-accent/50 hover:text-fg">
              <IconSearch /> <span className="flex-1 text-left">Search…</span> <span className="kbd">⌘K</span>
            </button>
            <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/80">Menu</div>
          </>
        )}

        <nav className="flex flex-1 flex-col gap-1">
          {links.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} aria-label={label} title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center rounded-xl py-2.5 text-sm transition ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} ${isActive
                  ? 'bg-gradient-to-r from-accent/20 to-accent/0 font-medium text-fg'
                  : 'text-muted hover:bg-panel2/70 hover:text-fg'}`}>
              {({ isActive }) => (
                <>
                  {isActive && <span className={`absolute top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_14px_var(--accent)] ${collapsed ? '-left-3' : '-left-4'}`} />}
                  <span className={isActive ? 'text-accent' : ''}><Icon /></span>{!collapsed && <> {label}</>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3">
          {collapsed ? (
            <div className="rounded-xl border border-line bg-panel2/60 px-1 py-2 text-center" title={`Today: ${signed(today.net)} · ${today.count} ${today.count === 1 ? 'trade' : 'trades'}`}>
              <div className="text-[9px] uppercase tracking-wider text-muted">Today</div>
              <div className={`num truncate text-[10px] font-semibold tracking-tight ${pnlColor(today.net)}`}>{signed(today.net)}</div>
            </div>
          ) : (
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
          )}
          <BackupBadge count={trades.length} settings={settings} compact={collapsed} />
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            {themeBtn}
            {!collapsed && <span className="text-[11px] text-muted">v1 · local only</span>}
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

      <main className={`mx-auto px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-12 ${collapsed ? 'max-w-[1600px]' : 'max-w-7xl'}`}>
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
              <Route path="/calculator" element={<Calculator rows={rows} settings={settings} save={saveSettings} />} />
              <Route path="/report" element={<Report rows={rows} settings={settings} />} />
              <Route path="/weekly" element={<Weekly rows={rows} settings={settings} />} />
              <Route path="/insights" element={<Insights rows={rows} settings={settings} save={saveSettings} />} />
              <Route path="/settings" element={<SettingsPage rows={rows} settings={settings} save={saveSettings} refresh={refresh} />} />
            </Routes>
          </div>
        )}
      </main>

      {/* Mobile: floating add + bottom nav */}
      {path !== '/calculator' && <button onClick={addTrade} aria-label="Add trade"
        className={`no-print btn fixed bottom-20 z-30 !h-14 !w-14 !rounded-2xl !p-0 md:hidden ${onTrades ? 'left-4' : 'right-4'}`}><IconPlus /></button>}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line/70 bg-panel/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden">
        {links.filter((l) => !l.desktopOnly).map(({ to, label, Icon }) => (
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
