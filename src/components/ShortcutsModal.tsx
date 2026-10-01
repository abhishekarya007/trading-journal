import Modal from './Modal'

const GROUPS: { title: string; items: [string[], string][] }[] = [
  { title: 'Anywhere', items: [
    [['N'], 'Add a new trade'],
    [['⌘', 'K'], 'Open the command palette'],
    [['/'], 'Search (command palette)'],
    [['C'], 'Cooldown timer'],
    [['['], 'Collapse or expand the menu'],
    [['?'], 'Show this list'],
    [['Esc'], 'Close the open window'],
  ] },
  { title: 'In the command palette', items: [
    [['↑', '↓'], 'Move through results'],
    [['Enter'], 'Run the highlighted one'],
  ] },
  { title: 'In tab bars', items: [
    [['←', '→'], 'Switch tab'],
    [['Home', 'End'], 'First or last tab'],
  ] },
]

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" size="md" onClose={onClose}>
      <div className="space-y-5">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="label">{g.title}</h3>
            <ul className="divide-y divide-line/60">
              {g.items.map(([keys, what]) => (
                <li key={what} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span>{what}</span>
                  <span className="flex shrink-0 gap-1">{keys.map((k) => <kbd key={k} className="kbd">{k}</kbd>)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-xs text-muted">Letter shortcuts are off while you are typing in a box.</p>
      </div>
    </Modal>
  )
}
