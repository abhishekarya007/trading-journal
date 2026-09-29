import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Only the top-most modal reacts to Escape (detail -> form -> lightbox can stack).
const stack: symbol[] = []

interface Props {
  title?: ReactNode
  onClose: () => void
  children: ReactNode
  size?: 'md' | 'lg' | 'xl' | 'full'
  z?: number
  closeOnBackdrop?: boolean
  footer?: ReactNode
}

const SIZES = { md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-4xl', full: 'max-w-6xl' }

export default function Modal({ title, onClose, children, size = 'lg', z = 50, closeOnBackdrop = true, footer }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  // Captured during the first render, before any child's autoFocus moves focus.
  const opener = useRef<HTMLElement | null>(null)
  if (opener.current === null && typeof document !== 'undefined') opener.current = document.activeElement as HTMLElement | null
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const id = Symbol('modal')
    stack.push(id)
    const prevFocus = opener.current
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Respect a child's own autoFocus; otherwise focus the first field, else the panel.
    if (!panel.current?.contains(document.activeElement)) {
      const first = panel.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')
      ;(first ?? panel.current)?.focus({ preventScroll: true })
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === id) {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(id), 1)
      if (!stack.length) document.body.style.overflow = prevOverflow
      prevFocus?.focus?.({ preventScroll: true })
    }
  }, [])

  // Portal to <body>: an animated/transformed ancestor (the page wrapper) would otherwise trap
  // this fixed overlay in its own stacking layer, under the sidebar and top bar.
  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm md:items-center md:p-6"
      style={{ zIndex: z }}
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        tabIndex={-1}
        className={`rise flex max-h-[92vh] w-full supports-[height:1dvh]:max-h-[92dvh] ${SIZES[size]} flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-2xl outline-none md:rounded-2xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0 text-base font-semibold">{title}</div>
          <button className="btn-ghost !px-2.5 !py-1" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line bg-panel2/40 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
