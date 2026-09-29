import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface TabDef<T extends string> { id: T; label: string; icon?: ReactNode; hint?: string }

interface Props<T extends string> {
  tabs: TabDef<T>[]
  value: T
  onChange: (id: T) => void
  label: string
  size?: 'md' | 'sm'
}

/** Accessible tab bar: arrow keys move between tabs, Home/End jump, scrolls sideways on narrow screens. */
export default function Tabs<T extends string>({ tabs, value, onChange, label, size = 'md' }: Props<T>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value)
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(tabs[next].id)
    refs.current[tabs[next].id]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey}
      className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-panel2/60 p-1 backdrop-blur [scrollbar-width:none]">
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button key={t.id} ref={(el) => { refs.current[t.id] = el }} role="tab" type="button" aria-selected={active} tabIndex={active ? 0 : -1} title={t.hint}
            onClick={() => onChange(t.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl font-medium transition ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} ${
              active ? 'bg-accent/20 text-fg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]' : 'text-muted hover:bg-panel2 hover:text-fg'}`}>
            {t.icon}{t.label}
          </button>
        )
      })}
    </div>
  )
}
