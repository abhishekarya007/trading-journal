import { NavLink, Route, Routes } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { db, useSettings, useTrades } from './lib/db'
import { calcTrade } from './lib/calc'
import type { Row } from './lib/stats'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import Insights from './pages/Insights'
import Weekly from './pages/Weekly'
import SettingsPage from './pages/SettingsPage'

const links = [
  ['/', 'Dashboard'],
  ['/trades', 'Trades'],
  ['/weekly', 'Weekly'],
  ['/insights', 'Insights'],
  ['/settings', 'Settings'],
] as const

export default function App() {
  const [settings, saveSettings] = useSettings()
  const { trades, loading, refresh } = useTrades()
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('tj-dark') === '1' } catch { return false }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('tj-dark', dark ? '1' : '0') } catch { /* ignore */ }
  }, [dark])

  const rows: Row[] = useMemo(
    () => trades.map((trade) => ({ trade, res: calcTrade(trade, settings.rates) })),
    [trades, settings.rates],
  )

  // Trades saved before the app became intraday-only.
  const legacy = trades.filter((t) => (t as { type?: string }).type === 'Delivery')
  const removeLegacy = async () => {
    if (!confirm(`Delete ${legacy.length} delivery trade(s)? This cannot be undone (export a backup first if unsure).`)) return
    await db.trades.bulkDelete(legacy.map((t) => t.id!))
    refresh()
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">📈 Trading Journal <span className="text-xs font-normal text-slate-500">NSE · Dhan</span></h1>
        <nav className="flex items-center gap-1">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}>
              {label}
            </NavLink>
          ))}
          <button className="btn-ghost ml-2" onClick={() => setDark((d) => !d)} aria-label="Toggle dark mode">{dark ? '☀️' : '🌙'}</button>
        </nav>
      </header>
      {legacy.length > 0 && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200">
          <span>{legacy.length} saved trade(s) were marked Delivery. This app is now intraday-only, so their charges are calculated as intraday and will be wrong.</span>
          <button className="btn-ghost" onClick={removeLegacy}>Delete them</button>
        </div>
      )}
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
        <Routes>
          <Route path="/" element={<Dashboard rows={rows} settings={settings} />} />
          <Route path="/trades" element={<Trades rows={rows} settings={settings} refresh={refresh} />} />
          <Route path="/weekly" element={<Weekly rows={rows} settings={settings} />} />
          <Route path="/insights" element={<Insights rows={rows} />} />
          <Route path="/settings" element={<SettingsPage settings={settings} save={saveSettings} refresh={refresh} />} />
        </Routes>
      )}
    </div>
  )
}
