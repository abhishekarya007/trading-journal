import { useMemo, useState } from 'react'
import type { Settings } from '../lib/types'
import { CATALOG, defOf, describeRule, newRule, type ParamValue, type Rule, type RuleType } from '../lib/rulebook'
import Modal from './Modal'

const GROUPS = ['Every trade', 'Each day', 'Timing', 'Behaviour'] as const

/** Add a rule (pick a kind, then set its numbers) or change one you already have. */
export default function RuleModal({ settings, rule, onSave, onClose }: { settings: Settings; rule?: Rule; onSave: (r: Rule) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Rule>(() => rule ?? newRule('stopLoss'))
  const def = defOf(draft.type)
  const setParam = (k: string, v: ParamValue) => setDraft((d) => ({ ...d, params: { ...d.params, [k]: v } }))
  const pick = (type: RuleType) => setDraft((d) => ({ ...newRule(type), id: d.id, enabled: d.enabled }))

  const problem = useMemo(() => {
    for (const f of def.fields) {
      const v = draft.params[f.key]
      if (f.kind === 'number' && !(Number(v) > 0)) return `${f.label} must be more than 0.`
      if (f.kind === 'setups' && !(Array.isArray(v) && v.length)) return 'Pick at least one setup.'
      if (f.kind === 'time' && !/^\d{1,2}:\d{2}$/.test(String(v))) return 'Choose a time.'
    }
    return ''
  }, [def, draft.params])

  return (
    <Modal title={rule ? 'Change rule' : 'Add a rule'} size="md" onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={!!problem} onClick={() => onSave(draft)}>{rule ? 'Save rule' : 'Add rule'}</button></div>}>
      <div className="space-y-4">
        {!rule && (
          <div>
            <label className="label" htmlFor="rule-type">Kind of rule</label>
            <select id="rule-type" className="input" value={draft.type} onChange={(e) => pick(e.target.value as RuleType)}>
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {CATALOG.filter((d) => d.group === g).map((d) => <option key={d.type} value={d.type}>{d.sentence(d.defaults).replace(/ none picked yet$/, '')}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        <p className="text-sm text-muted">{def.hint}</p>
        {def.fields.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={`f-${f.key}`}>{f.label}</label>
            {f.kind === 'number' && (
              <div className="flex items-center gap-2">
                {f.prefix && <span className="text-sm text-muted">{f.prefix}</span>}
                <input id={`f-${f.key}`} type="number" className="input num !w-32" min={f.min} step={f.step} value={Number(draft.params[f.key]) || ''}
                  onFocus={(e) => e.target.select()} onChange={(e) => setParam(f.key, e.target.value === '' ? 0 : Number(e.target.value))} />
                {f.suffix && <span className="text-sm text-muted">{f.suffix}</span>}
              </div>
            )}
            {f.kind === 'time' && <input id={`f-${f.key}`} type="time" className="input num !w-40" value={String(draft.params[f.key] ?? '')} onChange={(e) => setParam(f.key, e.target.value)} />}
            {f.kind === 'setups' && (
              <div className="flex flex-wrap gap-2" role="group" aria-label={f.label}>
                {settings.setups.map((s) => {
                  const list = Array.isArray(draft.params[f.key]) ? (draft.params[f.key] as string[]) : []
                  const on = list.includes(s)
                  return <button key={s} type="button" aria-pressed={on} onClick={() => setParam(f.key, on ? list.filter((x) => x !== s) : [...list, s])}
                    className={`rounded-full border px-3 py-1 text-xs transition ${on ? 'border-accent bg-accent/15 text-fg' : 'border-line text-muted hover:border-accent/50'}`}>{s}</button>
                })}
              </div>
            )}
          </div>
        ))}
        <div className="rounded-xl border border-line bg-panel2/40 px-3.5 py-2.5 text-sm">
          <span className="text-xs font-medium text-muted">Your rule</span>
          <div className="font-medium">{describeRule(draft)}</div>
        </div>
        {problem && <p className="text-xs text-down">{problem}</p>}
      </div>
    </Modal>
  )
}
