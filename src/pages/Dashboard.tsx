import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Settings } from '../lib/types'
import { equityCurve, groupNet, summarize, type Row } from '../lib/stats'
import { localDate } from '../lib/week'
import { inr, pct, pnlColor } from '../lib/format'
import Stat from '../components/Stat'
import BarPnl from '../components/BarPnl'
import Calendar from '../components/Calendar'
import RiskBanner from '../components/RiskBanner'
import { evaluateDay } from '../lib/risk'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Dashboard({ rows, settings }: { rows: Row[]; settings: Settings }) {
  const s = useMemo(() => summarize(rows), [rows])
  const curve = useMemo(() => equityCurve(rows, settings.startingCapital), [rows, settings.startingCapital])
  const byDay = useMemo(() => {
    const g = groupNet(rows, (r) => [DAYS[new Date(r.trade.date + 'T00:00:00').getDay()]])
    return DAY_ORDER.map((d) => g.find((x) => x.name === d)).filter((x): x is NonNullable<typeof x> => !!x)
  }, [rows])
  const bySetup = useMemo(() => groupNet(rows, (r) => [r.trade.setup || 'None']), [rows])

  const today = localDate()
  const warnings = useMemo(() => evaluateDay(rows, today, settings.risk), [rows, today, settings.risk])

  if (rows.length === 0)
    return <div className="card py-12 text-center text-slate-500">No trades yet. Head to <b>Trades</b> to log your first one.</div>

  return (
    <div className="space-y-4">
      <RiskBanner warnings={warnings} title="Today's risk rules" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Net P&L" value={inr(s.net)} className={pnlColor(s.net)} sub={`${s.count} trades · charges ${inr(s.charges)}`} />
        <Stat label="Win rate" value={pct(s.winRate)} sub={`Avg win ${inr(s.avgWin)} · Avg loss ${inr(s.avgLoss)}`} />
        <Stat label="Profit factor" value={Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'} sub={`Expectancy ${inr(s.expectancy)}/trade`} />
        <Stat label="Max drawdown" value={inr(s.maxDrawdown)} className="text-rose-600 dark:text-rose-400" sub={s.avgR !== null ? `Avg R ${s.avgR.toFixed(2)}` : 'Add stop-losses to see R'} />
      </div>

      <div className="card">
        <h3 className="mb-2 text-sm font-medium">Equity curve (starting {inr(settings.startingCapital)})</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={curve}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={60} domain={['auto', 'auto']} />
            <Tooltip formatter={(v) => [inr(Number(v)), 'Equity']} />
            <Area dataKey="equity" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BarPnl title="By weekday" data={byDay} />
        <BarPnl title="By setup" data={bySetup} />
      </div>
      <Calendar rows={rows} />
    </div>
  )
}
