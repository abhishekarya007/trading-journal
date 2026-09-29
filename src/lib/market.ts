/** NSE cash session status in IST, whatever the machine's timezone. Exchange holidays aren't known. */
export function nseStatus(now = new Date()) {
  const ist = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60_000)
  const day = ist.getDay()
  const m = ist.getHours() * 60 + ist.getMinutes()
  if (day === 0 || day === 6) return { open: false, label: 'Closed · weekend' }
  if (m >= 540 && m < 555) return { open: false, label: 'Pre-open' }
  if (m >= 555 && m < 930) return { open: true, label: 'Market open' }
  return { open: false, label: m < 540 ? 'Opens 9:15' : 'Closed' }
}
