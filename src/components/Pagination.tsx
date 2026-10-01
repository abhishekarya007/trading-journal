import { pageCount, pageWindow, rangeText } from '../lib/paginate'

interface Props {
  page: number
  total: number
  size: number
  sizes: readonly number[]
  unit: string // "trades" or "days"
  onPage: (p: number) => void
  onSize: (s: number) => void
}

/** Footer for a paged list: the range shown, rows per page, and previous / numbered / next buttons. */
export default function Pagination({ page, total, size, sizes, unit, onPage, onSize }: Props) {
  const pages = pageCount(total, size)
  if (total === 0) return null
  const btn = 'rowbtn !h-8 !min-w-8 !w-auto border border-line px-2 text-xs font-medium disabled:opacity-40'
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line px-4 py-3 md:px-5">
      <p className="text-xs text-muted">Showing <b className="num text-fg">{rangeText(page, total, size)}</b> {unit}</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="hidden sm:inline">{unit === 'days' ? 'Days' : 'Rows'} per page</span>
          <select className="input !w-auto !py-1 text-xs" value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label={`${unit} per page`}>
            {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button type="button" className={btn} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">‹ <span className="hidden sm:inline">Prev</span></button>
          <span className="px-2 text-xs text-muted sm:hidden">Page {page} of {pages}</span>
          <span className="hidden items-center gap-1 sm:flex">
            {pageWindow(page, pages).map((n, i) => n === '…'
              ? <span key={`g${i}`} className="px-1 text-xs text-muted" aria-hidden="true">…</span>
              : <button key={n} type="button" onClick={() => onPage(n)} aria-label={`Page ${n}`} aria-current={n === page ? 'page' : undefined}
                  className={`${btn} ${n === page ? '!border-accent !bg-accent !text-white' : ''}`}>{n}</button>)}
          </span>
          <button type="button" className={btn} onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page"><span className="hidden sm:inline">Next</span> ›</button>
        </div>
      </div>
    </nav>
  )
}
