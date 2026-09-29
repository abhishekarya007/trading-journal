import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { groupNet, summarize, type Row } from '../lib/stats'
import type { Settings } from '../lib/types'
import { monthlyCapital } from '../lib/capital'
import CapitalInput from '../components/CapitalInput'
import {
  adherence, discipline, disciplineVerdict, holding, mistakeCost, overtrading, payoff, reentry, rHistogram, scorecard, sizing, symbolBoard, tilt, timeOfDay,
} from '../lib/insights'
import { inr, pct, pnlColor } from '../lib/format'
import { localDate } from '../lib/week'
import { afterBadDay, bestWorstDays, confidence, hhmm, noteWords, searchNotes, snippet } from '../lib/habits'
import BarPnl from '../components/BarPnl'
import PageTitle from '../components/PageTitle'
import { Card, CountBars, Empty, Section, Table, mins } from '../components/InsightBits'

const N = ({ v }: { v: number }) => <span className={pnlColor(v)}>{inr(v)}</span>
function CompareBar({ label, value, max, sub }: { label: string; value: number; max: number; sub?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}{sub && <span className="ml-2 text-[11px]">{sub}</span>}</span>
        <span className={`num font-semibold ${pnlColor(value)}`}>{value > 0 ? '+' : ''}{inr(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-panel2">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${max ? Math.max(3, (Math.abs(value) / max) * 100) : 0}%`, background: value >= 0 ? 'linear-gradient(90deg, var(--up), var(--accent))' : 'linear-gradient(90deg, var(--down), var(--warn))' }} />
      </div>
    </div>
  )
}
const x = (v: number) => `${v.toFixed(2)}×`
const pf = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '∞')

const monthLabel = (key: string, long = true) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: long ? 'long' : 'short', year: 'numeric' })
}
const prevMonthKey = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Insights({ rows: allRows, settings, save }: { rows: Row[]; settings: Settings; save: (s: Settings) => void }) {
  const [mode, setMode] = useState<'split' | 'full'>('split')
  const [scope, setScope] = useState<'all' | 'month'>('all')
  const [noteQ, setNoteQ] = useState('')
  const navigate = useNavigate()
  const currentMonth = localDate().slice(0, 7)
  const [month, setMonth] = useState(currentMonth)

  // Months that have trades, plus the current one, newest first.
  const months = useMemo(
    () => [...new Set([currentMonth, ...allRows.map((r) => r.trade.date.slice(0, 7))])].sort().reverse(),
    [allRows, currentMonth],
  )
  const rows = useMemo(
    () => (scope === 'all' ? allRows : allRows.filter((r) => r.trade.date.startsWith(month))),
    [allRows, scope, month],
  )
  const prevSummary = useMemo(() => {
    if (scope !== 'month') return null
    const pk = prevMonthKey(month)
    const pr = allRows.filter((r) => r.trade.date.startsWith(pk))
    return pr.length ? { key: pk, ...summarize(pr) } : null
  }, [allRows, scope, month])
  const period = useMemo(() => summarize(rows), [rows])
  const caps = useMemo(() => monthlyCapital(allRows, settings, currentMonth), [allRows, settings, currentMonth])
  const cap = scope === 'month' ? caps.get(month) : undefined
  const monthReturns = [...caps.values()].filter((c) => c.trades > 0).map((c) => c.returnPct)
  const avgMonthReturn = monthReturns.length ? monthReturns.reduce((a, b) => a + b, 0) / monthReturns.length : 0
  const setCap = (m: string, v: number | null) => {
    const next = { ...settings.monthCapital }
    if (v === null) delete next[m]
    else next[m] = v
    save({ ...settings, monthCapital: next })
  }
  const mi = months.indexOf(month)
  const d = useMemo(() => ({
    followed: summarize(rows.filter((r) => r.trade.followedPlan)),
    broke: summarize(rows.filter((r) => !r.trade.followedPlan)),
    emotion: groupNet(rows, (r) => [r.trade.emotion]),
    mistakes: mistakeCost(rows, settings.exitMistakes),
    tilt: tilt(rows),
    disc: discipline(rows, settings.exitMistakes),
    size: sizing(rows),
    gap: reentry(rows),
    bw: bestWorstDays(rows),
    after: afterBadDay(rows),
    conf: confidence(rows),
    words: noteWords(rows),
    over: overtrading(rows),
    setups: scorecard(rows, (r) => r.trade.setup || 'None'),
    symbols: symbolBoard(rows),
    side: scorecard(rows, (r) => r.trade.side),
    tod: timeOfDay(rows),
    hold: holding(rows),
    rHist: rHistogram(rows),
    payoff: payoff(rows),
    adh: adherence(rows),
  }), [rows, settings.exitMistakes])

  if (allRows.length === 0) return <div className="card py-12 text-center text-muted">Log some trades to see behaviour insights.</div>

  const { tilt: t, payoff: p, adh: a, disc, size, gap, bw, after, conf, words } = d
  const sgn = (n: number) => (n > 0 ? '+' : '') + inr(n)
  const noteHits = searchNotes(rows, noteQ)
  const notesCount = rows.filter((r) => r.trade.notes.trim()).length
  const discMax = Math.max(Math.abs(disc.actual), Math.abs(disc.disciplined), 1)
  const discV = disciplineVerdict(disc)
  const sizeEnough = size.count >= 5
  const chase = (r: { count: number; ratio: number }) => r.count >= 3 && r.ratio > 1.15
  const sizeMsg = !sizeEnough ? 'Need at least 5 trades to judge your sizing.'
    : chase(size.afterTwoLosses) ? '⚠ You size up after two losses in a row, the classic way to dig a deeper hole.'
      : chase(size.afterLoss) ? '⚠ You trade bigger right after a loss (revenge sizing).'
        : chase(size.afterWin) ? '⚠ You trade bigger right after a win, which can be overconfidence.'
          : size.cv < 0.3 ? 'Your position sizes are very consistent. 👍' : size.cv < 0.6 ? 'Your sizing varies moderately.' : 'Your sizing swings a lot from trade to trade. Pick one standard size or risk amount.'
  const quickBad = gap.quick.count >= 2 && gap.quick.net < 0
  const gapMsg = gap.measured === 0 ? 'Add exit and entry times to your trades to see this.'
    : gap.quick.count === 0 ? '✅ You never re-entered within 5 minutes of a losing trade.'
      : quickBad ? `⚠ ${gap.quick.count} re-entries within 5 minutes of a loss lost ${inr(-gap.quick.net)} in total${gap.slower.count >= 2 ? ` (avg ${inr(gap.quick.avgNet)} vs ${inr(gap.slower.avgNet)} when you waited)` : ''}. Take a short break after every loss.`
        : `${gap.quick.count} quick re-entries after a loss made ${inr(gap.quick.net)}, so it hasn't hurt so far.`
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
      <PageTitle title="Insights" sub={scope === 'all' ? 'What your trades say about your habits and edge · all time' : `What went on in ${monthLabel(month)}`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Period">
            <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All time</button>
            <button aria-pressed={scope === 'month'} onClick={() => setScope('month')}>Month</button>
          </div>
          {scope === 'month' && (
            <div className="flex items-center gap-1.5">
              <button className="btn-ghost !px-2.5" onClick={() => setMonth(months[mi + 1])} disabled={mi >= months.length - 1} aria-label="Previous month">‹</button>
              <select className="input !w-auto !py-1.5" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
                {months.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
              </select>
              <button className="btn-ghost !px-2.5" onClick={() => setMonth(months[mi - 1])} disabled={mi <= 0} aria-label="Next month">›</button>
              {cap && (
                <div className="ml-1 flex items-center gap-2">
                  <span className="label !mb-0 hidden sm:block">Trading capital</span>
                  <CapitalInput key={month} value={cap.capital} overridden={cap.overridden} compact onSave={(v) => setCap(month, v)} />
                </div>
              )}
            </div>
          )}
        </div>
      </PageTitle>

      <div className="-mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="chip">{period.count} trades</span>
        {cap ? (
          <>
            <span className="chip">Capital <b className="num text-fg">{inr(cap.capital)}</b></span>
            <span className="chip">P&amp;L <b className={`num ${pnlColor(period.net)}`}>{period.net > 0 ? '+' : ''}{inr(period.net)}</b></span>
            <span className="chip">Return <b className={`num ${pnlColor(cap.returnPct)}`}>{cap.returnPct > 0 ? '+' : ''}{cap.returnPct.toFixed(2)}%</b></span>
            <span className="chip">Max drawdown <b className="num text-down">{cap.capital > 0 ? ((period.maxDrawdown / cap.capital) * 100).toFixed(2) : '0.00'}%</b></span>
          </>
        ) : (
          <>
            <span className="chip">Net <b className={`num ${pnlColor(period.net)}`}>{period.net > 0 ? '+' : ''}{inr(period.net)}</b></span>
            {monthReturns.length > 1 && <span className="chip">Avg month <b className={`num ${pnlColor(avgMonthReturn)}`}>{avgMonthReturn > 0 ? '+' : ''}{avgMonthReturn.toFixed(2)}%</b></span>}
          </>
        )}
        <span className="chip">Win rate <b className="num text-fg">{pct(period.winRate)}</b></span>
        <span className="chip">Profit factor <b className="num text-fg">{pf(period.profitFactor)}</b></span>
        <span className="chip">Charges <b className="num text-fg">{inr(period.charges)}</b></span>
        {prevSummary && (
          <span className="chip">vs {monthLabel(prevSummary.key, false)}{' '}
            <b className={`num ${pnlColor(period.net - prevSummary.net)}`}>{period.net - prevSummary.net > 0 ? '+' : ''}{inr(period.net - prevSummary.net)}</b>
          </span>
        )}
      </div>

      {rows.length === 0 && <div className="card py-12 text-center text-muted">No trades in {monthLabel(month)}. Pick another month or switch to All time.</div>}
      {rows.length > 0 && <>
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

        <Card title="Disciplined vs actual P&L" note="What you would have made if you had skipped every trade where you broke your plan or made an entry or behaviour mistake.">
          {disc.flawed.count === 0 ? <Empty>✅ {discV.text}</Empty> : (
            <>
              <div className="space-y-3.5">
                <CompareBar label="Actual" sub={`${d.followed.count + d.broke.count} trades`} value={disc.actual} max={discMax} />
                <CompareBar label="If disciplined" sub={`${disc.clean.count} clean trades`} value={disc.disciplined} max={discMax} />
              </div>
              <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="label !mb-0">{disc.cost >= 0 ? 'Indiscipline cost' : 'Rule-breaking gain'}</span>
                <span className={`num text-2xl font-semibold ${disc.cost > 0 ? 'text-down' : 'text-up'}`}>{inr(Math.abs(disc.cost))}</span>
              </div>
              <p className={`mt-2 rounded-xl border px-3 py-2 text-sm leading-relaxed ${discV.tone === 'warn' ? 'border-warn/40 bg-warn/10' : 'border-accent/30 bg-accent/10'}`}>{discV.text}</p>
              <div className="mt-3">
                <Table head={['', 'Trades', 'Win rate', 'Avg / trade', 'Net']}
                  rows={[
                    ['Clean trades', disc.clean.count, pct(disc.clean.winRate), <N key="a" v={disc.clean.expectancy} />, <N key="b" v={disc.clean.net} />],
                    ['Flawed trades', disc.flawed.count, pct(disc.flawed.winRate), <N key="c" v={disc.flawed.expectancy} />, <N key="d" v={disc.flawed.net} />],
                  ]} />
                <p className="mt-2 text-xs text-muted">Flawed = broke the plan ({disc.brokePlan}) or had an entry/behaviour mistake tagged ({disc.mistaken}); a trade can be both. Exit mistakes such as early exit don&apos;t count here.</p>
              </div>
            </>
          )}
        </Card>

        <Card title="Cost of mistakes" note={mode === 'split'
          ? 'A trade with several mistakes has its P&L divided evenly between them, so the rows add up to what you actually lost.'
          : "Each tag gets the whole trade's P&L. Trades with several mistakes appear in several rows, so the rows overlap and don't add up."}>
          {d.mistakes.table.length === 0 ? <Empty>No mistakes tagged yet.</Empty> : (
            <>
              <div className="seg mb-3" role="group" aria-label="How to count trades with several mistakes">
                <button aria-pressed={mode === 'split'} onClick={() => setMode('split')}>Split evenly</button>
                <button aria-pressed={mode === 'full'} onClick={() => setMode('full')}>Full trade</button>
              </div>
              <Table head={['Mistake', 'Trades', 'Only this mistake', 'Total P&L', 'Avg / trade', 'If avoided']}
                rows={[
                  ...d.mistakes.table.map((m) => [
                    m.tag, m.count,
                    m.solo.count ? <span key="s"><N v={m.solo.net} /> <span className="text-muted">({m.solo.count})</span></span> : <span key="s" className="text-muted">–</span>,
                    <N key="n" v={m[mode].net} />, <N key="a" v={m[mode].avgNet} />, <N key="w" v={m[mode].netWithout} />,
                  ]),
                  [<b key="t">All mistaken trades</b>, d.mistakes.tagged.count, '', <b key="tn"><N v={d.mistakes.tagged.net} /></b>, <N key="ta" v={d.mistakes.tagged.count ? d.mistakes.tagged.net / d.mistakes.tagged.count : 0} />, ''],
                ]} />
              <p className="mt-2 text-xs text-muted">
                “If avoided” = your net P&amp;L {mode === 'split' ? "with only this mistake's share removed" : 'had you skipped every trade with that tag'}.
                The last row counts each trade once.
                {d.mistakes.multi.count > 0 && <> {d.mistakes.multi.count} of your mistaken trades had 2+ mistakes (combined P&amp;L <N v={d.mistakes.multi.net} />).</>}
              </p>
            </>
          )}
          {d.mistakes.exit.tags.length > 0 && (
            <div className="mt-4 rounded-xl border border-line bg-panel2/40 p-3">
              <div className="label !mb-2">Exit mistakes · counted, not priced</div>
              <div className="flex flex-wrap gap-2">
                {d.mistakes.exit.tags.map((e) => (
                  <span key={e.tag} className="chip !text-fg">{e.tag} <b className="num">{e.count}</b> <span className="text-muted">{e.count === 1 ? 'trade' : 'trades'} · {pct((e.count / Math.max(1, rows.length)) * 100)}</span></span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                {d.mistakes.exit.trades} of {rows.length} trades. These aren&apos;t in the rupee figures above, because the cost of leaving early depends on what the price did after you left.
                {a.leftAmount > 0 && <> Your targets suggest up to <b className="num text-fg">{inr(a.leftAmount)}</b> was left on the table (see Target discipline).</>}
              </p>
            </div>
          )}
          {d.mistakes.clean.count > 0 && (
            <p className="mt-2 text-xs text-muted">Trades with no entry/behaviour mistakes: {d.mistakes.clean.count}, net <N v={d.mistakes.clean.net} />, avg <N v={d.mistakes.clean.avgNet} /> per trade.</p>
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
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Position size consistency" note={sizeEnough ? `Size = entry price × quantity. Your median is ${inr(size.median)}.` : undefined}>
            {!sizeEnough ? <Empty>{sizeMsg}</Empty> : (
              <>
                <Table head={['', 'Trades', 'Win rate', 'Avg P&L']}
                  rows={[
                    ['Normal size', size.normal.count, pct(size.normal.winRate), <N key="n" v={size.normal.avgNet} />],
                    [`Oversized (>${size.overFactor}× median)`, size.oversized.count, size.oversized.count ? pct(size.oversized.winRate) : '–', size.oversized.count ? <N key="o" v={size.oversized.avgNet} /> : '–'],
                  ]} />
                <div className="mt-3">
                  <Table head={['Size vs your median, right after…', 'Trades', 'Avg size']}
                    rows={([['a win', size.afterWin], ['a loss', size.afterLoss], ['2+ losses in a row', size.afterTwoLosses]] as const).map(([l, g]) => [
                      l, g.count,
                      g.count ? <span key={l} className={g.ratio > 1.15 ? 'text-warn' : ''}>{x(g.ratio)}</span> : '–',
                    ])} />
                </div>
                <p className="mt-2 text-sm">{sizeMsg}</p>
                <p className="mt-1 text-xs text-muted">Variation {(size.cv * 100).toFixed(0)}% · biggest trade {x(size.biggestRatio)} your median.</p>
              </>
            )}
          </Card>

          <Card title="Time between trades after a loss" note="Gap from exiting one trade to entering the next, same day. Quick re-entry is a classic revenge-trade sign.">
            {gap.measured === 0 ? <Empty>{gapMsg}</Empty> : (
              <>
                <Table head={['After a loss, waited', 'Trades', 'Win rate', 'Avg P&L']}
                  rows={gap.afterLoss.map((b) => [b.name, b.count, pct(b.winRate), <N key={b.name} v={b.avgNet} />])} />
                {gap.afterWin.length > 0 && (
                  <div className="mt-3">
                    <Table head={['After a win, waited', 'Trades', 'Win rate', 'Avg P&L']}
                      rows={gap.afterWin.map((b) => [b.name, b.count, pct(b.winRate), <N key={b.name} v={b.avgNet} />])} />
                  </div>
                )}
                <p className="mt-2 text-sm">{gapMsg}</p>
                {gap.missing > 0 && <p className="mt-1 text-xs text-muted">{gap.missing} same-day pairs lack an exit or entry time and are excluded.</p>}
              </>
            )}
          </Card>
        </div>
        <Card title="Best vs worst days" note={bw.enough ? `Your ${bw.k} best and ${bw.k} worst trading days side by side.` : undefined}>
          {!bw.enough ? <Empty>Need at least 6 trading days to compare ({bw.days} so far).</Empty> : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {([['Best days', bw.best, 'text-up'], ['Worst days', bw.worst, 'text-down']] as const).map(([label, g, cls]) => (
                  <div key={label} className="rounded-xl border border-line p-3.5">
                    <div className={`text-sm font-semibold ${cls}`}>{label} <span className="num font-normal text-muted">· avg {sgn(g.profile.avgNet)} a day</span></div>
                    <ul className="mb-3 mt-2 space-y-0.5 text-xs">
                      {g.days.map((dd) => <li key={dd.date} className="flex justify-between text-muted"><span>{dd.date} · {dd.count} {dd.count === 1 ? 'trade' : 'trades'}</span><N v={dd.net} /></li>)}
                    </ul>
                    <dl className="space-y-1 border-t border-line pt-2 text-sm">
                      {([
                        ['Trades a day', g.profile.tradesPerDay.toFixed(1)],
                        ['Win rate', pct(g.profile.winRate)],
                        ['Followed plan', pct(g.profile.planRate)],
                        ['Trades with a mistake', pct(g.profile.mistakeRate)],
                        ['First trade around', g.profile.firstEntry !== null ? hhmm(g.profile.firstEntry) : '–'],
                        ['Main setup', g.profile.topSetup?.name ?? '–'],
                        ['Main emotion', g.profile.topEmotion?.name ?? '–'],
                      ] as const).map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="num">{v}</dd></div>)}
                    </dl>
                  </div>
                ))}
              </div>
              <ul className="mt-3 space-y-1 rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-sm">
                {bw.findings.map((f, i) => <li key={i}>• {f}</li>)}
              </ul>
            </>
          )}
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="The day after a losing day" note="Your next trading day, depending on how the previous one ended.">
            {after.afterLoss.days + after.afterWin.days === 0 ? <Empty>Need trades on at least two different days.</Empty> : (
              <>
                <Table head={['Next day after…', 'Days', 'Trades', 'Win rate', 'Avg day P&L', 'Size']}
                  rows={([['a losing day', after.afterLoss], ['a winning day', after.afterWin], ['2+ losing days', after.afterTwoLosses]] as const)
                    .filter(([, g]) => g.days > 0)
                    .map(([l, g]) => [l, g.days, g.tradesPerDay.toFixed(1), pct(g.winRate), <N key={l} v={g.avgNet} />, g.sizeRatio ? x(g.sizeRatio) : '–'])} />
                <ul className="mt-3 space-y-1 text-sm">{after.findings.map((f, i) => <li key={i}>• {f}</li>)}</ul>
                <p className="mt-2 text-xs text-muted">Size = average position size compared with your overall median.</p>
              </>
            )}
          </Card>

          <Card title="Confidence vs results" note="Do the trades you feel surest about actually do better?">
            {conf.rated === 0 ? <Empty>{conf.verdict}</Empty> : (
              <>
                <Table head={['Rating', 'Trades', 'Win rate', 'Avg P&L']}
                  rows={conf.levels.filter((l) => l.count > 0).map((l) => [`${l.level} ${'★'.repeat(l.level)}`, l.count, pct(l.winRate), <N key={l.level} v={l.avgNet} />])} />
                <p className="mt-3 text-sm">{conf.verdict}</p>
                {conf.unrated > 0 && <p className="mt-1 text-xs text-muted">{conf.unrated} trades have no rating and are excluded.</p>}
              </>
            )}
          </Card>
        </div>

        <Card title="Notes" note="Search what you wrote, or tap a recurring word or phrase to see what those trades cost you.">
          {notesCount === 0 ? <Empty>Write notes on your trades to search and analyse them here.</Empty> : (
            <>
              <input className="input" placeholder="Search your notes… e.g. chased, too early, revenge" value={noteQ} onChange={(e) => setNoteQ(e.target.value)} aria-label="Search notes" />
              {words.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {words.map((w) => (
                    <button key={w.phrase} type="button" onClick={() => setNoteQ(w.phrase)}
                      className={`chip transition hover:border-accent/60 ${noteQ.toLowerCase() === w.phrase ? '!border-accent !text-fg' : ''}`}
                      title={`${w.count} trades · net ${sgn(w.net)} · win rate ${w.winRate.toFixed(0)}%`}>
                      {w.phrase} <b className="num text-fg">{w.count}</b> <span className={`num ${pnlColor(w.net)}`}>{sgn(w.net)}</span>
                    </button>
                  ))}
                </div>
              )}
              {words.length === 0 && <p className="mt-3 text-xs text-muted">No word appears in two or more notes yet.</p>}
              {noteQ.trim() && (
                noteHits.matches.length === 0 ? <p className="mt-4 text-sm text-muted">No notes mention “{noteQ.trim()}”.</p> : (
                  <div className="mt-4">
                    <div className="mb-2 flex flex-wrap gap-2 text-xs">
                      <span className="chip">{noteHits.matches.length} {noteHits.matches.length === 1 ? 'trade' : 'trades'}</span>
                      <span className="chip">Net <b className={`num ${pnlColor(noteHits.summary!.net)}`}>{sgn(noteHits.summary!.net)}</b></span>
                      <span className="chip">Avg <b className={`num ${pnlColor(noteHits.summary!.expectancy)}`}>{sgn(noteHits.summary!.expectancy)}</b></span>
                      <span className="chip">Win rate <b className="num text-fg">{pct(noteHits.summary!.winRate)}</b></span>
                    </div>
                    <div className="-mx-2 flex flex-col">
                      {noteHits.matches.slice(0, 8).map(({ trade: tr, res }) => {
                        const sn = snippet(tr.notes, noteQ)
                        return (
                          <button key={tr.id} type="button" onClick={() => navigate('/trades', { state: { open: tr.id } })}
                            className="flex items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-panel2/70">
                            <div className="w-24 shrink-0 text-xs text-muted">{tr.date}<div className="text-sm font-semibold text-fg">{tr.symbol}</div></div>
                            <div className="min-w-0 flex-1 text-sm">{sn.pre}<mark className="rounded bg-accent/30 px-0.5 text-fg">{sn.hit}</mark>{sn.post}</div>
                            <div className={`num shrink-0 text-sm font-semibold ${pnlColor(res.net)}`}>{sgn(res.net)}</div>
                          </button>
                        )
                      })}
                    </div>
                    {noteHits.matches.length > 8 && <p className="mt-1 text-xs text-muted">and {noteHits.matches.length - 8} more…</p>}
                  </div>
                )
              )}
            </>
          )}
        </Card>

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
                {a.leftAmount > 0 && <p>Left on the table: up to <b className="num text-warn">{inr(a.leftAmount)}</b> <span className="text-xs text-muted">if each had reached its target</span></p>}
                <p>Never got there (ended in loss): <b>{a.lossWithTarget}</b></p>
              </div>
            )}
          </Card>
        </div>
      </Section>
      </>}
    </div>
  )
}
