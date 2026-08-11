// Text input on --surface with accent focus ring (+glow on dark). The numeric variant
// renders values in JetBrains Mono and hints a decimal keypad — reused by P6's capture form.
import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  numeric?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { numeric = false, className = '', ...props },
  ref,
) {
  const numericProps = numeric ? { inputMode: 'decimal' as const } : {}
  return (
    <input
      ref={ref}
      className={
        'w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-text ' +
        'placeholder:text-muted focus:border-accent dark:focus:shadow-glow ' +
        (numeric ? 'font-mono ' : 'font-sans ') +
        className
      }
      {...numericProps}
      {...props}
    />
  )
})
