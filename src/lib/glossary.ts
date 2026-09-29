// Plain-English explanations for the numbers in the app. Each takes your own figure so the hint can use it.
export interface Tip { title: string; text: string }

const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`

export const tips = {
  winRate: (rate: number, wins: number, losses: number): Tip => ({
    title: 'Win rate',
    text: `The share of your trades that made money after charges. You won ${wins} of ${wins + losses} (${rate.toFixed(1)}%). A low win rate is fine if your winners are much bigger than your losers, so read it together with your average win and loss.`,
  }),
  profitFactor: (pf: number): Tip => ({
    title: 'Profit factor',
    text: Number.isFinite(pf)
      ? `Money won on winning trades divided by money lost on losing trades. Above 1 means you make more than you lose. Yours is ${pf.toFixed(2)}: for every ₹1 you lost, you won ₹${pf.toFixed(2)}.`
      : 'Money won on winning trades divided by money lost on losing trades. You have no losing trades yet, so it can’t be worked out.',
  }),
  expectancy: (e: number): Tip => ({
    title: 'Expectancy',
    text: `The average result of one trade after charges. Positive means your approach makes money on average. Yours is ${e < 0 ? '-' : '+'}${inr(e)} per trade, so 100 trades like these would give about ${e < 0 ? '-' : '+'}${inr(e * 100)}.`,
  }),
  maxDrawdown: (dd: number): Tip => ({
    title: 'Max drawdown',
    text: `The biggest fall from a high point of your cumulative P&L down to the next low. It shows the worst rough patch you sat through. Yours is ${inr(dd)}. Ask whether you could handle a drop like that again.`,
  }),
  rMultiple: (): Tip => ({
    title: 'R-multiple',
    text: 'R is the amount you planned to risk on a trade (entry to stop-loss). A trade that made 2R earned twice what you risked, and -1R lost exactly what you planned. It lets you compare trades of different sizes.',
  }),
  payoff: (ratio: number | null, breakeven: number | null): Tip => ({
    title: 'Payoff ratio and break-even',
    text: ratio === null || breakeven === null
      ? 'Average win divided by average loss. It tells you what win rate you need just to break even.'
      : `Average win divided by average loss. Yours is ${ratio.toFixed(2)}, so you need to win at least ${breakeven.toFixed(1)}% of trades to break even. Win more than that and you make money.`,
  }),
  ifAvoided: (): Tip => ({
    title: 'If avoided',
    text: 'Your total net P&L as it would be if you hadn’t made that mistake. A higher number than your real P&L means the mistake cost you money.',
  }),
  disciplined: (): Tip => ({
    title: 'Disciplined vs actual',
    text: 'Compares what you actually made with what you would have made from only the trades where you followed your plan and made no entry or behaviour mistake. The gap is the price (or the luck) of breaking your rules.',
  }),
  sizeVariation: (cv: number): Tip => ({
    title: 'Size variation',
    text: `How much your trade sizes differ from each other. 0% means every trade is the same size. Yours is ${(cv * 100).toFixed(0)}%; above about 60% means sizes jump around a lot, which makes results harder to compare and control.`,
  }),
  setupColumns: (): Tip => ({
    title: 'Setup scorecard columns',
    text: 'Win rate: share of winning trades. Avg R: average result in multiples of your planned risk. Expectancy: average rupees per trade. Profit factor: rupees won for every rupee lost. Look for setups that are positive on all of them.',
  }),
  tilt: (): Tip => ({
    title: 'Tilt',
    text: 'Playing worse after a loss, out of frustration. This compares your next trade after a loss with your next trade after a win, in the same day. If you do worse or bigger after a loss, take a break after every loss.',
  }),
} as const
