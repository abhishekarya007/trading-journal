export const LIST_SIZES = [10, 25, 50, 100] as const
export const DAY_SIZES = [10, 20, 30] as const

export const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / Math.max(1, size)))
export const clampPage = (page: number, total: number, size: number) => Math.min(Math.max(1, page), pageCount(total, size))

/** The items on one page (pages start at 1). Out-of-range pages are pulled back to the nearest real page. */
export function pageSlice<T>(items: T[], page: number, size: number): T[] {
  const p = clampPage(page, items.length, size)
  return items.slice((p - 1) * size, p * size)
}

/** "26–50 of 99" for the footer. */
export function rangeText(page: number, total: number, size: number) {
  if (total === 0) return '0 of 0'
  const p = clampPage(page, total, size)
  return `${(p - 1) * size + 1}–${Math.min(total, p * size)} of ${total}`
}

/**
 * Page buttons to show: always first and last, a few around the current page, and "…" for the gaps.
 * e.g. 1 … 4 5 6 … 12
 */
export function pageWindow(page: number, pages: number, around = 1): (number | '…')[] {
  const want = new Set<number>([1, pages])
  for (let i = page - around; i <= page + around; i++) if (i >= 1 && i <= pages) want.add(i)
  const sorted = [...want].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  sorted.forEach((n, i) => {
    if (i > 0) {
      const gap = n - sorted[i - 1]
      if (gap === 2) out.push(n - 1) // a single hidden page is just shown
      else if (gap > 2) out.push('…')
    }
    out.push(n)
  })
  return out
}
