import { IconChecklist } from './Icons'

/** Sidebar entry that opens the pre-trade checklist. */
export default function ChecklistButton({ collapsed, onOpen }: { collapsed: boolean; onOpen: () => void }) {
  if (collapsed)
    return (
      <button type="button" onClick={onOpen} aria-label="Pre-trade checklist" title="Pre-trade checklist  ( Z )"
        className="flex h-11 w-full items-center justify-center rounded-xl border border-line bg-panel2/50 text-muted transition hover:border-accent/50 hover:text-fg"><IconChecklist /></button>
    )
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-panel2/50 px-3 py-2.5 text-sm text-muted transition hover:border-accent/50 hover:text-fg">
      <IconChecklist /> <span className="flex-1 text-left">Pre-trade checklist</span> <span className="kbd">Z</span>
    </button>
  )
}
