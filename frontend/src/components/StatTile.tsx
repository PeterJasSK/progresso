// Hero metric: big Orbitron value + Inter label + mono delta (green up / red down / muted).
// Proves the token + type system end-to-end on the placeholder homes.
import { Card } from './Card'

type Trend = 'up' | 'down' | 'flat'

interface StatTileProps {
  label: string
  value: string
  delta?: string
  deltaLabel?: string
  trend?: Trend
}

const trendColor: Record<Trend, string> = {
  up: 'text-success',
  down: 'text-danger',
  flat: 'text-muted',
}

export function StatTile({ label, value, delta, deltaLabel, trend = 'flat' }: StatTileProps) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="font-sans text-sm text-muted">{label}</span>
      <span className="font-display text-3xl font-bold text-heading">{value}</span>
      {delta && (
        <span className={`font-mono text-sm ${trendColor[trend]}`}>
          {delta}
          {deltaLabel && <span className="ml-1 text-muted">{deltaLabel}</span>}
        </span>
      )}
    </Card>
  )
}
