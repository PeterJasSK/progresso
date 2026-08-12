// A single-metric line chart (§5.6). Colors come from CSS custom properties
// (token-sourced, no hex here); the `theme` prop triggers a re-read so a
// light↔dark toggle recolors. Only the Chart.js pieces we use are registered.
import { useMemo } from 'react'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { formatDate } from '../i18n'

ChartJS.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
)

interface MetricChartProps {
  labels: string[]
  data: (number | null)[]
  colorVar: string
  label: string
  // Active theme — passed so colors re-resolve when it flips.
  theme: string
  // Chart height: 'full' (default, /me/progress) or 'compact' (dashboard mini).
  size?: 'full' | 'compact'
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const MONO_FONT = "'JetBrains Mono', monospace"

export function MetricChart({
  labels,
  data,
  colorVar,
  label,
  theme,
  size = 'full',
}: MetricChartProps) {
  const { chartData, options } = useMemo(() => {
    // `theme` is read below via cssVar; referenced here so the memo re-runs on toggle.
    void theme
    const line = cssVar(colorVar) || cssVar('--accent')
    const grid = cssVar('--border')
    const tick = cssVar('--muted')

    const chartData: ChartData<'line'> = {
      labels: labels.map((d) => formatDate(d)),
      datasets: [
        {
          label,
          data: data as number[],
          borderColor: line,
          backgroundColor: line,
          pointBackgroundColor: line,
          tension: 0.25,
          spanGaps: true,
          fill: false,
        },
      ],
    }

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: grid },
          ticks: { color: tick, font: { family: MONO_FONT } },
        },
        y: {
          grid: { color: grid },
          ticks: { color: tick, font: { family: MONO_FONT } },
        },
      },
    }
    return { chartData, options }
  }, [labels, data, colorVar, label, theme])

  return (
    <div className={`${size === 'compact' ? 'h-40' : 'h-72'} w-full`}>
      <Line data={chartData} options={options} />
    </div>
  )
}
