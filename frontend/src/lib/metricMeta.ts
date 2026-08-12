// Single source of metric metadata: the ordered metric list, each metric's i18n
// label key, its display unit, and the CSS custom-property that colors its chart
// line (§5.4). The capture form, list, charts, and goals all read this so metric
// naming never drifts.

export type MetricKey =
  | 'weight'
  | 'height'
  | 'chest'
  | 'waist'
  | 'hips'
  | 'biceps'
  | 'thigh'
  | 'calf'
  | 'body_fat_pct'
  | 'bmi'

export interface MetricMeta {
  key: MetricKey
  // i18n key under the shared `metrics.*` namespace.
  labelKey: string
  // Display unit suffix ('' for BMI which is unitless).
  unit: string
  // CSS custom property holding the chart line color (token-sourced, §5.6).
  colorVar: string
  // Whether a goal may target this metric (height/bmi excluded, §11 Q6).
  goalTarget: boolean
}

// Order matches the capture form field order and the measurement value fields.
export const METRICS: readonly MetricMeta[] = [
  { key: 'weight', labelKey: 'metrics.weight', unit: 'kg', colorVar: '--c-weight', goalTarget: true },
  { key: 'height', labelKey: 'metrics.height', unit: 'cm', colorVar: '--accent', goalTarget: false },
  { key: 'chest', labelKey: 'metrics.chest', unit: 'cm', colorVar: '--c-chest', goalTarget: true },
  { key: 'waist', labelKey: 'metrics.waist', unit: 'cm', colorVar: '--c-waist', goalTarget: true },
  { key: 'hips', labelKey: 'metrics.hips', unit: 'cm', colorVar: '--c-biceps', goalTarget: true },
  { key: 'biceps', labelKey: 'metrics.biceps', unit: 'cm', colorVar: '--c-biceps', goalTarget: true },
  { key: 'thigh', labelKey: 'metrics.thigh', unit: 'cm', colorVar: '--c-thigh', goalTarget: true },
  { key: 'calf', labelKey: 'metrics.calf', unit: 'cm', colorVar: '--c-calf', goalTarget: true },
  { key: 'body_fat_pct', labelKey: 'metrics.body_fat_pct', unit: '%', colorVar: '--c-waist', goalTarget: true },
  { key: 'bmi', labelKey: 'metrics.bmi', unit: '', colorVar: '--accent', goalTarget: false },
]

// The value fields a trainee can enter on the capture form: everything except the
// derived BMI (server-computed) and height (a once-set profile attribute set on
// /profile, not per measurement — P9).
export const VALUE_METRICS: readonly MetricMeta[] = METRICS.filter(
  (m) => m.key !== 'bmi' && m.key !== 'height',
)

// The metrics a goal may target (§11 Q6).
export const GOAL_METRICS: readonly MetricMeta[] = METRICS.filter((m) => m.goalTarget)

export const METRIC_BY_KEY: Record<MetricKey, MetricMeta> = Object.fromEntries(
  METRICS.map((m) => [m.key, m]),
) as Record<MetricKey, MetricMeta>
