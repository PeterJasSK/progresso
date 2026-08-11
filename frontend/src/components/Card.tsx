// Rounded surface card: --bg fill, 1px --border, radius-md, soft navy shadow.
import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-md border border-border bg-bg p-6 shadow-card ${className}`}
      {...props}
    />
  )
}
