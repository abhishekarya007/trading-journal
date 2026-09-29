import type { ReactNode } from 'react'
import Sparkline from './Sparkline'

interface Props {
  label: string
  value: ReactNode
  sub?: string
  className?: string
  spark?: number[]
  tone?: 'up' | 'down' | 'accent'
  icon?: ReactNode
  info?: ReactNode // e.g. an <InfoTip/> explaining the number
}

export default function Stat({ label, value, sub, className = '', spark, tone = 'accent', icon, info }: Props) {
  return (
    <div className="card card-hover flex flex-col overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="label !mb-0 flex items-center gap-1.5">{label}{info}</div>
        {icon && <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">{icon}</span>}
      </div>
      <div className={`num mt-2 text-2xl font-semibold tracking-tight ${className}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
      {spark && <div className="-mx-4 -mb-4 mt-auto pt-3 md:-mx-5 md:-mb-5"><Sparkline values={spark} tone={tone} /></div>}
    </div>
  )
}
