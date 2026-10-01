import { useState } from 'react'
import type { Settings } from '../lib/types'
import { elapsedPct, extendCooldown, formatClock, startCooldown, stopCooldown, useCooldown } from '../lib/cooldown'
import Modal from './Modal'
import Ring from './Ring'
import { time12 } from '../lib/format'

const PRESETS = [5, 10, 15, 30, 45]
const TIPS = ['Stand up and step away from the screen.', 'Breathe slowly, in for 4 and out for 6, a few times.', 'Write what happened in one line. Was it the plan, or the market?']

export default function CooldownModal({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const { cd, now, remaining, active } = useCooldown()
  const [minutes, setMinutes] = useState(settings.cooldown.minutes)
  const [custom, setCustom] = useState('')
  const chosen = custom.trim() ? Number(custom) : minutes
  const valid = Number.isFinite(chosen) && chosen >= 1 && chosen <= 240

  return (
    <Modal title="Cooldown timer" size="md" onClose={onClose}>
      {active && cd ? (
        <div className="space-y-5 text-center">
          <div className="flex justify-center py-1">
            <Ring value={elapsedPct(cd, now)} size={190} stroke={12}>
              <div className="num text-4xl font-semibold tracking-tight" aria-live="off">{formatClock(remaining)}</div>
              <div className="mt-1 text-xs text-muted">ends at {time12(`${new Date(cd.end).getHours()}:${String(new Date(cd.end).getMinutes()).padStart(2, '0')}`)}</div>
            </Ring>
          </div>
          <p className="text-sm text-muted">Don’t take the next trade until this reaches zero. You can still log trades you’ve already made.</p>
          <ul className="space-y-1.5 rounded-xl border border-line bg-panel2/40 p-3.5 text-left text-sm">
            {TIPS.map((t) => <li key={t} className="flex gap-2"><span className="text-accent">•</span>{t}</li>)}
          </ul>
          <div className="flex justify-center gap-2">
            <button className="btn-ghost" onClick={() => extendCooldown(5)}>+5 min</button>
            <button className="btn-ghost !text-down" onClick={() => { stopCooldown(); onClose() }}>End cooldown</button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-muted">Hit a stop-loss? Revenge trades usually happen in the first few minutes after a loss. Step away for a set time before you take the next one.</p>
          <div>
            <div className="label">How long?</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Cooldown length in minutes">
              {PRESETS.map((m) => (
                <button key={m} type="button" aria-pressed={!custom.trim() && minutes === m} onClick={() => { setMinutes(m); setCustom('') }}
                  className={`chip transition hover:border-accent/60 ${!custom.trim() && minutes === m ? '!border-accent !bg-accent/15 !text-fg' : ''}`}>{m} min</button>
              ))}
              <span className="flex items-center gap-1.5 text-xs text-muted">or
                <input type="number" min={1} max={240} className="input num !w-20 !py-1.5" placeholder="min" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom minutes" /></span>
            </div>
          </div>
          <button className="btn w-full !py-3 text-base" disabled={!valid} onClick={() => startCooldown(chosen)}>Start {valid ? Math.round(chosen) : ''}-minute cooldown</button>
          <p className="text-center text-[11px] text-muted">The timer keeps running if you close or reload the app. Change the defaults in Settings.</p>
        </div>
      )}
    </Modal>
  )
}
