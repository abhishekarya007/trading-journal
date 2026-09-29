import { useMemo } from 'react'
import { groupNet, summarize, type Row } from '../lib/stats'
import {
  adherence, holding, mistakeCost, overtrading, payoff, rHistogram, scorecard, symbolBoard, tilt, timeOfDay,
} from '../lib/insights'
import { inr, pct, pnlColor } from '../lib/format'
import BarPnl from '../components/BarPnl'
import PageTitle from '../components/PageTitle'
import { Card, CountBars, Empty, Section, Table, mins } from '../components/InsightBits'

const N = ({ v }: { v: number }) => <span className={pnlColor(v)}>{inr(v)}</span>
const pf = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '∞')

export default function Insights({ rows }: { rows: Row[] }) {
  const d = useMemo(() => ({
    followed: summarize(rows.filter((r) => r.trade.followedPlan)),
    broke: summarize(rows.filter((r) => !r.trade.followedPlan)),
    emotion: groupNet(rows, (r) => [r.trade.emotion]),
    mistakes: mistakeCost(rows),
    tilt: tilt(rows),
    over: overtrading(rows),
    setups: scorecard(rows, (r) => r.trade.setup || 'None'),
    symbols: symbolBoard(rows),
    side: scorecard(rows, (r) => r.trade.side),
    tod: timeOfDay(rows),
    hold: holding(rows),
    rHist: rHistogram(rows),
    payoff: payoff(rows),
    adh: adherence(rows),
  }), [rows])

  if (rows.length === 0) return <div className="card py-12 text-center text-muted">Log some trades to see behaviour insights.</div>

  const { tilt: t, payoff: p, adh: a } = d
  const tiltMsg =
    t.afterLoss.count >= 3 && t.afterWin.count >= 3
      ? t.afterLoss.avgNet < t.afterWin.avgNet && t.afterLoss.avgSize > t.afterWin.avgSize * 1.15
        ? '⚠ After a loss you trade bigger and do worse — classic revenge trading.'
        : t.afterLoss.avgNet < t.afterWin.avgNet
          ? 'You do worse right after a loss. Consider a short break after any losing trade.'
          : 'No sign of tilt: you perform as well after a loss as after a win.'
      : 'Need at least 3 same-day trades after both a win and a loss for a verdict.'

  return (
    <div className="space-y-8">
      <PageTitle title="Insights" sub="What your trades say about your habits and edge" />
      <Section title="Behaviour">
        <div className="grid gap-3 md:grid-cols-2">
          {([['Followed plan', d.followed], ['Broke plan', d.broke]] as const).map(([label, x]) => (
            <div className="card" key={label}>
              <div className="text-xs text-muted">{label}</div>
              <div className={`mt-1 text-xl font-semibold ${pnlColor(x.net)}`}>{inr(x.net)}</div>
              <div className="text-xs text-muted">{x.count} trades · win rate {pct(x.winRate)} · expectancy {inr(x.expectancy)}/trade</div>
            </div>
          ))}
        </div>

        <Card title="Cost of mistakes" note="'If avoided' = your net P&L had you skipped every trade with that tag.">
          {d.mistakes.table.length === 0 ? <Empty>No mistakes tagged yet.</Empty> : (
            <Table head={['Mistake', 'Trades', 'Total P&L', 'Avg / trade', 'If avoided']}
              rows={d.mistakes.table.map((m) => [m.tag, m.count, <N v={m.net} />, <N v={m.avgNet} />, <N v={m.netWithout} />])} />
          )}
          {d.mistakes.clean.count > 0 && (
            <p className="mt-2 text-xs text-muted">Trades with no mistakes: {d.mistakes.clean.count}, net <N v={d.mistakes.clean.net} />, avg <N v={d.mistakes.clean.avgNet} /> per trade.</p>
          )}
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Tilt check" note="Same-day trades right after a loss vs after a win.">
            <Table head={['', 'Trades', 'Win rate', 'Avg P&L', 'Avg size']}
              rows={([['After a loss', t.afterLoss], ['After a win', t.afterWin]] as const).map(([l, x]) =>
                [l, x.count, pct(x.winRate), <N v={x.avgNet} />, inr(x.avgSize)])} />
            <p className="mt-2 text-sm">{tiltMsg}</p>
          </Card>
          <Card title="Overtrading check" note="Average day P&L by how many trades you took that day.">
            {d.over.length === 0 ? <Empty /> : (
              <Table head={['Trades that day', 'Days', 'Avg day P&L', 'Total']}
                rows={d.over.map((o) => [o.name, o.days, <N v={o.avgDayNet} />, <N v={o.totalNet} />])} />
            )}
          </Card>
        </div>
        <BarPnl title="Net P&L by emotion" data={d.emotion} />
      </Section>

      <Section title="Where your edge is">
        <Card title="Setup scorecard">
          <Table head={['Setup', 'Trades', 'Win rate', 'Avg R', 'Expectancy', 'Profit factor', 'Net P&L']}
            rows={d.setups.map((s) => [s.name, s.count, pct(s.winRate), s.avgR !== null ? s.avgR.toFixed(2) : '–', <N v={s.expectancy} />, pf(s.profitFactor), <N v={s.net} />])} />
        </Card>

        <Card title="Long vs Short">
          <Table head={['Side', 'Trades', 'Win rate', 'Expectancy', 'Net']}
            rows={d.side.map((s) => [s.name, s.count, pct(s.winRate), <N v={s.expectancy} />, <N v={s.net} />])} />
        </Card>

        <Card title="Symbol leaderboard" note="Best five and worst five stocks by net P&L.">
          <div className="grid gap-4 md:grid-cols-2">
            {([['Best', d.symbols.slice(0, 5).filter((s) => s.net > 0)], ['Worst', [...d.symbols].reverse().slice(0, 5).filter((s) => s.net < 0)]] as const).map(([label, list]) => (
              <div key={label}>
                <div className="mb-1 text-xs font-medium text-muted">{label}</div>
                {list.length === 0 ? <Empty>None</Empty> : (
                  <Table head={['Symbol', 'Trades', 'Win rate', 'Net']} rows={list.map((s) => [s.symbol, s.count, pct(s.winRate), <N v={s.net} />])} />
                )}
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {d.tod.data.length ? <BarPnl title="Net P&L by entry hour" data={d.tod.data} /> : <Card title="Net P&L by entry hour"><Empty>Add entry times to your trades to see this.</Empty></Card>}
          {d.hold.buckets.length ? <BarPnl title="Net P&L by holding time" data={d.hold.buckets} /> : <Card title="Net P&L by holding time"><Empty>Add entry and exit times to intraday trades to see this.</Empty></Card>}
        </div>
        {d.tod.data.length > 0 && d.tod.missing > 0 && <p className="text-xs text-muted">{d.tod.missing} trades have no entry time and are excluded from the hour chart.</p>}
        {d.hold.count > 0 && (
          <p className="text-sm">
            Average hold: winners <b>{mins(d.hold.avgWinMin)}</b>, losers <b>{mins(d.hold.avgLossMin)}</b>
            {d.hold.avgLossMin > d.hold.avgWinMin * 1.2 ? ' — you hold losers longer than winners.' : d.hold.avgWinMin > d.hold.avgLossMin * 1.2 ? ' — you let winners run longer than losers. 👍' : '.'}
          </p>
        )}
      </Section>

      <Section title="Risk & execution">
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="R-multiple distribution" note={d.rHist.missing ? `${d.rHist.missing} trades without a stop-loss are excluded.` : 'Net R per trade (after charges).'}>
            {d.rHist.total === 0 ? <Empty>Add stop-losses to your trades to see R.</Empty> : <CountBars data={d.rHist.data} />}
          </Card>
          <Card title="Win/loss size" note="Do your winners pay for your losers?">
            {p.ratio === null ? <Empty /> : (
              <div className="space-y-1 text-sm">
                <p>Average win <b className="text-up">{inr(p.avgWin)}</b> · average loss <b className="text-down">{inr(p.avgLoss)}</b></p>
                <p>Payoff ratio: <b>{p.ratio.toFixed(2)}</b></p>
                <p>Break-even win rate at this payoff: <b>{pct(p.breakevenWinRate!)}</b></p>
                <p>Your actual win rate: <b>{pct(p.winRate)}</b> — {p.winRate >= p.breakevenWinRate! ? <span className="text-up">above break-even ✅</span> : <span className="text-down">below break-even ⚠</span>}</p>
              </div>
            )}
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Stop-loss discipline" note="Losing trades that had a stop-loss set (price move, before charges).">
            {a.losersWithSl === 0 ? <Empty>No losing trades with a stop-loss yet.</Empty> : (
              <div className="space-y-1 text-sm">
                <p>Exited at the stop as planned: <b>{a.asPlanned}</b> of {a.losersWithSl}</p>
                <p>Cut before the stop: <b>{a.cutEarly}</b></p>
                <p className={a.heldPast ? 'text-down' : ''}>Held past the stop: <b>{a.heldPast}</b>{a.heldPast > 0 && <> (avg {a.avgOvershootR.toFixed(1)}R beyond the stop)</>}</p>
              </div>
            )}
          </Card>
          <Card title="Target discipline" note="Trades where you set a target.">
            {a.targetTrades === 0 ? <Empty>No trades with a target yet.</Empty> : (
              <div className="space-y-1 text-sm">
                <p>Planned average risk:reward: <b>1 : {a.avgPlannedRR.toFixed(1)}</b></p>
                <p>Reached target: <b>{a.hit}</b> of {a.targetTrades}</p>
                <p>Exited in profit before target: <b>{a.exitedEarly}</b>{a.exitedEarly > 0 && a.avgLeftR > 0 && <> (left avg {a.avgLeftR.toFixed(1)}R on the table)</>}</p>
                <p>Never got there (ended in loss): <b>{a.lossWithTarget}</b></p>
              </div>
            )}
          </Card>
        </div>
      </Section>
    </div>
  )
}
