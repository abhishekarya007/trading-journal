import { NavLink, Route, Routes } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { db, useSettings, useTrades } from './lib/db'
import { calcTrade } from './lib/calc'
import { summarize, type Row } from './lib/stats'
import { localDate } from './lib/week'
import { inr, pnlColor } from './lib/format'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import Insights from './pages/Insights'
import Weekly from './pages/Weekly'
import SettingsPage from './pages/SettingsPage'
import { IconDashboard, IconInsights, IconLogo, IconMoon, IconSettings, IconSun, IconTrades, IconWeekly } from './components/Icons'

const links = [
  { to: '/', label: 'Dashboard', Icon: IconDashboard },
  { to: '/trades', label: 'Trades', Icon: IconTrades },
  { to: '/weekly', label: 'Weekly', Icon: IconWeekly },
  { to: '/insights', label: 'Insights', Icon: IconInsights },
  { to: '/settings', label: 'Settings', Icon: IconSettings },
]

export default function App() {
  const [settings, saveSettings] = useSettings()
  const { trades, loading, refresh } = useTrades()
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
  const today = useMemo(() => summarize(rows.filter((r) => r.trade.date === localDate())), [rows])

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
    <div className="min-h-screen md:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-panel/80 p-4 backdrop-blur md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-1">
          <IconLogo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Trading Journal</div>
            <div className="text-[11px] text-muted">NSE · Intraday</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {links.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-accent/15 font-medium text-accent' : 'text-muted hover:bg-panel2 hover:text-fg'}`}>
              <Icon /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-panel2 p-3">
            <div className="label !mb-1">Today</div>
            <div className={`num text-xl font-semibold ${pnlColor(today.net)}`}>{today.net > 0 ? '+' : ''}{inr(today.net)}</div>
            <div className="mt-0.5 text-xs text-muted">{today.count} {today.count === 1 ? 'trade' : 'trades'}{today.count ? ` · ${today.winRate.toFixed(0)}% win` : ''}</div>
          </div>
          {themeBtn}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-panel/90 px-4 py-2.5 backdrop-blur md:hidden">
        <div className="flex items-center gap-2"><IconLogo /><span className="text-sm font-semibold">Trading Journal</span></div>
        <div className="flex items-center gap-3">
          <span className={`num text-sm font-semibold ${pnlColor(today.net)}`}>{today.net > 0 ? '+' : ''}{inr(today.net)}</span>
          {themeBtn}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-10">
        {legacy.length > 0 && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/50 bg-warn/10 p-3 text-sm">
            <span>{legacy.length} saved trade(s) were marked Delivery. This app is now intraday-only, so their charges are calculated as intraday and will be wrong.</span>
            <button className="btn-ghost" onClick={removeLegacy}>Delete them</button>
          </div>
        )}
        {loading ? <p className="text-sm text-muted">Loading…</p> : (
          <div className="page">
            <Routes>
              <Route path="/" element={<Dashboard rows={rows} settings={settings} />} />
              <Route path="/trades" element={<Trades rows={rows} settings={settings} refresh={refresh} />} />
              <Route path="/weekly" element={<Weekly rows={rows} settings={settings} />} />
              <Route path="/insights" element={<Insights rows={rows} />} />
              <Route path="/settings" element={<SettingsPage settings={settings} save={saveSettings} refresh={refresh} />} />
            </Routes>
          </div>
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {links.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${isActive ? 'text-accent' : 'text-muted'}`}>
            <Icon /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
