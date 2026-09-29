// Local-time date helpers (toISOString would shift dates back a day in IST early mornings).
const pad = (n: number) => String(n).padStart(2, '0')

export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: string, n: number): string {
  const d = parse(date)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const d = parse(date)
  return addDays(date, -((d.getDay() + 6) % 7))
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function formatRange(start: string): string {
  const f = (s: string) => parse(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return `${f(start)} – ${f(addDays(start, 6))}, ${parse(addDays(start, 6)).getFullYear()}`
}
