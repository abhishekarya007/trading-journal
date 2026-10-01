export const inr = (n: number, digits = 0) =>
  (n < 0 ? '-₹' : '₹') +
  Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
export const pct = (n: number) => `${n.toFixed(1)}%`
export const pnlColor = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted')

/** "13:05" or "9:05" to "1:05 PM" / "9:05 AM". Anything that isn't a time is returned as it was. */
export function time12(t?: string | null): string {
  if (!t) return ''
  const m = /^(\d{1,2}):(\d{2})/.exec(t)
  if (!m) return t
  const h = Number(m[1]) % 24
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`
}
/** Minutes after midnight to "9:15 AM". Rounds first, so 10:59.6 reads 11:00 AM, never 10:60. */
export const minutes12 = (m: number) => {
  const t = Math.round(m)
  return time12(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`)
}
/** An hour of the day (0 to 23) as "11 AM" or "1 PM". */
export const hour12 = (h: number) => `${h % 12 || 12} ${h % 24 >= 12 ? 'PM' : 'AM'}`
