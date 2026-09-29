import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Tip } from '../lib/glossary'

const W = 288

/** A small "?" that explains a number in plain English. Works on hover, keyboard focus and tap. */
export default function InfoTip({ title, text }: Tip) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0, above: false })
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()

  const show = () => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const above = r.bottom > window.innerHeight - 190
    setPos({ left: Math.max(8, Math.min(window.innerWidth - W - 8, r.left + r.width / 2 - W / 2)), top: above ? r.top - 8 : r.bottom + 8, above })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onDown = (e: MouseEvent) => { if (!btn.current?.contains(e.target as Node)) close() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button ref={btn} type="button" aria-label={`What is ${title}?`} aria-expanded={open} aria-describedby={open ? id : undefined}
        onClick={() => (open ? setOpen(false) : show())} onMouseEnter={show} onMouseLeave={() => setOpen(false)} onFocus={show} onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line text-[10px] font-bold normal-case leading-none tracking-normal text-muted transition hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent">?</button>
      {open && createPortal(
        <div id={id} role="tooltip" style={{ position: 'fixed', left: pos.left, top: pos.top, width: W, transform: pos.above ? 'translateY(-100%)' : undefined, zIndex: 85 }}
          className="pointer-events-none rounded-xl border border-line bg-panel/95 p-3 text-left text-xs normal-case leading-relaxed tracking-normal text-fg shadow-2xl backdrop-blur-xl">
          <div className="mb-1 text-[13px] font-semibold">{title}</div>
          {text}
        </div>,
        document.body,
      )}
    </>
  )
}
