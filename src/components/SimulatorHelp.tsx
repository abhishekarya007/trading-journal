import Modal from './Modal'

const STEPS: [string, string][] = [
  ['Start with a preset, or "My journal numbers"', 'This fills in your real win rate, reward : risk, loss size and charges. Presets show how different styles behave (a trend follower wins less often but wins big).'],
  ['Set how you size trades', 'Risk a fixed ₹ amount, or a % of your capital. With %, the amount shrinks after losses and grows after wins, which is how most traders size.'],
  ['Open "Costs & realism"', 'Add charges per trade, then raise Variation if your real trades are messy. Charges matter more than most people expect when the edge is small.'],
  ['Try your daily rules', 'Under "Daily rules & goal", set trades per day, then "stop after losses in a row" or "stop once down R". The Risk tab shows how many trades the rules skipped and how the dips change.'],
  ['Read the tabs', 'Overview: the chance of profit and the range of outcomes. Risk: how bad it can get. Compare styles: two styles side by side. Profit map: which mixes of win rate and reward : risk make money.'],
  ['Re-roll and compare', 'Re-roll runs a fresh set of random trades. If the answer changes a lot, the result is mostly luck at this size. More trades or more futures steadies it.'],
]
const TERMS: [string, string][] = [
  ['Win rate', 'Out of every 100 trades, how many win.'],
  ['Reward : risk (1 : 1.5)', 'A winner makes 1.5 times what a loser costs.'],
  ['R', 'One unit of risk. If you risk ₹1,000, then +2R is +₹2,000 and -1R is -₹1,000.'],
  ['Expectancy', 'What an average trade earns, after charges. Above zero means an edge.'],
  ['Futures / simulations', 'Each one is a made-up run of all your trades. Thousands of them show the range of what could happen.'],
  ['Median / typical', 'The middle result: half the futures did better, half worse.'],
  ['Lucky or unlucky 10%', 'The best and worst 1 in 10 futures. Plan for the unlucky end, not the average.'],
  ['Drawdown', 'How far the account falls from its highest point before recovering.'],
  ['Losing streak', 'Losses in a row. Even a good style has long ones, so size so you can survive them.'],
  ['Kelly', 'The share of capital to risk per trade that grows money fastest. It is aggressive, so many traders use half of it or less.'],
  ['Seed', 'Fixes the randomness. The same seed always gives the same results, so you can compare changes fairly.'],
  ['Variation', 'How much real trades differ from the plan: winners land near the target, losers can slip past the stop.'],
]

export default function SimulatorHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to use the Pro simulator" size="lg" onClose={onClose}>
      <div className="space-y-6">
        <p className="text-sm text-muted">The simulator takes thousands of made-up runs of your trading style and shows the range of results, not just the average. It is a what-if, not a forecast: it assumes each trade is independent and your numbers never change.</p>
        <section>
          <h3 className="label">Steps</h3>
          <ol className="space-y-3">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
                <div><div className="text-sm font-semibold">{t}</div><div className="text-sm text-muted">{d}</div></div>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3 className="label">What the words mean</h3>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {TERMS.map(([t, d]) => <div key={t}><dt className="text-sm font-semibold">{t}</dt><dd className="text-sm text-muted">{d}</dd></div>)}
          </dl>
        </section>
      </div>
    </Modal>
  )
}
