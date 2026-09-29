import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconSearch } from './Icons'

export interface Command { id: string; label: string; group: string; hint?: string; icon?: ReactNode; run: () => void }

export default function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open) { setQ(''); setActive(0) } }, [open])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? commands.filter((c) => `${c.label} ${c.group}`.toLowerCase().includes(needle)) : commands
  }, [commands, q])

  useEffect(() => { setActive(0) }, [q])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null
  const run = (c: Command) => { onClose(); c.run() }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/55 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rise w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-panel/95 shadow-2xl backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="flex items-center gap-3 border-b border-line px-4 text-muted">
          <IconSearch />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a page, action or symbol…"
            className="w-full bg-transparent py-4 text-sm text-fg outline-none placeholder:text-muted"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(list.length - 1, i + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
              else if (e.key === 'Enter' && list[active]) { e.preventDefault(); run(list[active]) }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
            }} />
          <span className="kbd">esc</span>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {list.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">No matches for “{q}”</p>}
          {list.map((c, i) => (
            <div key={c.id}>
              {(i === 0 || list[i - 1].group !== c.group) && (
                <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{c.group}</div>
              )}
              <button data-i={i} onMouseMove={() => setActive(i)} onClick={() => run(c)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${i === active ? 'bg-accent/15 text-fg' : 'text-fg/85'}`}>
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${i === active ? 'bg-accent/25 text-accent' : 'bg-panel2 text-muted'}`}>{c.icon}</span>
                <span className="flex-1">{c.label}</span>
                {c.hint && <span className="kbd">{c.hint}</span>}
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-line bg-panel2/40 px-4 py-2 text-[11px] text-muted">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> navigate</span>
          <span><span className="kbd">↵</span> open</span>
          <span className="ml-auto"><span className="kbd">⌘</span> <span className="kbd">K</span> toggle</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
