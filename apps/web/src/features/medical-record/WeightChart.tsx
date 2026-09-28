'use client'

import { useTranslations } from '@/components/LocaleProvider'
import { chartGeometry, formatWeight, type WeightPoint } from './view-model'

/** Values are written above every point up to this many; beyond it, only the first and the last. */
const LABELLED_POINTS = 8

/**
 * The weight line: the shared layout (axis from 10% below the lightest
 * weight, guides at round weights) drawn as SVG. It is one image with a
 * spoken label; the numbers themselves are always also given as text next
 * to it, so nothing is known only from the picture.
 */
export default function WeightChart({
  points,
  label,
  height = 150,
  className,
}: {
  points: WeightPoint[]
  label: string
  /** The plot's height in the chart's own units; the width is always 640. */
  height?: number
  className?: string
}) {
  const dict = useTranslations()
  const words = dict.medicalRecord
  const box = { width: 640, height, left: 58, right: 28, top: 26, bottom: 34 }
  const plotWidth = box.width - box.left - box.right
  const geometry = chartGeometry(points, plotWidth, box.height)
  const x = (value: number) => box.left + value
  const y = (value: number) => box.top + value
  const path = geometry.points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.x).toFixed(1)} ${y(point.y).toFixed(1)}`).join(' ')
  // First, middle and last dates under the axis: enough to read the span, never crowded.
  const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].map((index) => geometry.points[index])
  const last = geometry.points.length - 1
  return (
    <svg
      className={`weight-chart${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${box.width} ${box.top + box.height + box.bottom}`}
      role="img"
      aria-label={label}
    >
      {geometry.guides.map((guide) => (
        <g key={guide.y}>
          <line x1={box.left} x2={box.width - box.right} y1={y(guide.y)} y2={y(guide.y)} />
          <text className="guide-label" x={0} y={y(guide.y) + 4}>{formatWeight(words, guide.value)}</text>
        </g>
      ))}
      <path d={path} />
      {geometry.points.map((point, index) => (
        <g key={point.key}>
          <circle cx={x(point.x)} cy={y(point.y)} r={6} />
          {(geometry.points.length <= LABELLED_POINTS || index === 0 || index === last) && (
            <text className="value" x={x(point.x)} y={y(point.y) - 14} textAnchor="middle">
              {point.label.replace(/\s.*$/, '')}
            </text>
          )}
        </g>
      ))}
      {ticks.map((point, index) => (
        <text
          key={`tick-${point.key}`}
          className="tick"
          x={x(point.x)}
          y={box.top + box.height + 26}
          textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}
        >
          {point.dayLabel}
        </text>
      ))}
    </svg>
  )
}
