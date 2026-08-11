// Primary (filled --primary, glow on dark hover) and ghost (bordered, accent text).
// Token-backed utilities only; focus ring comes from the global :focus-visible rule.
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const base =
  'inline-flex items-center justify-center rounded-sm px-4 py-2.5 font-sans font-medium ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-60'

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-white hover:bg-primary-hover dark:hover:shadow-glow',
  ghost:
    'border border-border bg-transparent text-accent hover:bg-surface',
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}
