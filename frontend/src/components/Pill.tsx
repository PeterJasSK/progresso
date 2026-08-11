// Rounded status pill. Default accent-tinted; warn/ok variants for state chips.
import type { HTMLAttributes } from 'react'

type Variant = 'accent' | 'warn' | 'ok'

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
}

const variants: Record<Variant, string> = {
  accent: 'border-border text-accent',
  warn: 'border-warn text-warn',
  ok: 'border-success text-success',
}

export function Pill({ variant = 'accent', className = '', ...props }: PillProps) {
  return (
    <span
      className={
        'inline-flex items-center rounded-pill border bg-surface px-3 py-1 ' +
        'font-sans text-xs font-medium ' +
        variants[variant] +
        ' ' +
        className
      }
      {...props}
    />
  )
}
