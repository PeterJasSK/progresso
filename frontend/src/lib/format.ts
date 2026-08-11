// Small display helpers shared by the trainee screens. Locale formatting lives in
// i18n; these adapt the API's decimal-strings / nullable numbers for the readout.
import { formatNumber } from '../i18n'

// A DecimalField comes back as a string ("82.40") or null. Format it for display,
// or show an em-dash placeholder when absent.
export function formatDecimal(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isNaN(n) ? '—' : formatNumber(n)
}

// Format a value with its unit suffix (e.g. "82.4 kg"). Unit may be '' (BMI).
export function formatWithUnit(
  value: string | number | null | undefined,
  unit: string,
): string {
  const formatted = formatDecimal(value)
  if (formatted === '—') return formatted
  return unit ? `${formatted} ${unit}` : formatted
}
