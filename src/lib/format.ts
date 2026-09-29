export const inr = (n: number, digits = 0) =>
  (n < 0 ? '-₹' : '₹') +
  Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
export const pct = (n: number) => `${n.toFixed(1)}%`
export const pnlColor = (n: number) =>
  n > 0 ? 'text-emerald-600 dark:text-emerald-400' : n < 0 ? 'text-rose-600 dark:text-rose-400' : ''
