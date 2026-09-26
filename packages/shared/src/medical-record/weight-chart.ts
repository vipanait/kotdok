import type { DatedWeight } from './record-overview'

/**
 * The weight chart's geometry, the same on the phone and the site: where
 * each point goes and which weights the guide lines stand at. Drawing is
 * each app's own (react-native-svg, an SVG element).
 */

export type ChartLayout = {
  points: Array<{ x: number; y: number; value: number; measured_on: string }>
  /** The axis, not the data: it starts 10% below the lightest weight (spec §7.8). */
  min: number
  max: number
}

/**
 * Where each point goes in a `width` × `height` box; null below two points,
 * where a line says nothing (the screen explains instead).
 *
 * Starting the axis at zero would flatten a 0.3 kg change into nothing. The
 * lightest weight is always above zero, so the axis always has a height and
 * nothing here divides by zero — even when every point is the same.
 */
export function chartLayout(points: readonly DatedWeight[], width: number, height: number): ChartLayout | null {
  if (points.length < 2) return null

  const values = points.map((point) => point.weight_kg)
  const min = Math.min(...values) * 0.9
  const top = Math.max(...values)
  const max = top + (top - min) * 0.1

  const first = Date.parse(`${points[0].measured_on}T00:00:00Z`)
  const span = Date.parse(`${points[points.length - 1].measured_on}T00:00:00Z`) - first

  return {
    min,
    max,
    points: points.map((point, index) => ({
      x: span > 0
        ? ((Date.parse(`${point.measured_on}T00:00:00Z`) - first) / span) * width
        : (index / (points.length - 1)) * width,
      y: height - ((point.weight_kg - min) / (max - min)) * height,
      value: point.weight_kg,
      measured_on: point.measured_on,
    })),
  }
}

/** Steps between guide lines, in tenths of a kilogram: 0.1, 0.2, 0.5, 1, 2, 5… kg. */
const STEPS_IN_TENTHS = [1, 2, 5, 10, 20, 50, 100, 200, 500]

/** At most this many guide lines; fewer would leave the axis unreadable. */
const MAX_TICKS = 4

/**
 * The weights the guide lines stand at: round values (one decimal at most)
 * inside the axis, two to four of them, evenly spaced. A line is drawn at
 * exactly the weight its label says — a 4.4 kg point sits on the «4,4» line.
 * Counted in tenths so no floating error shifts a line off its label.
 */
export function chartTicks(min: number, max: number): number[] {
  const low = Math.ceil(min * 10 - 1e-9)
  const high = Math.floor(max * 10 + 1e-9)
  for (const step of STEPS_IN_TENTHS) {
    const ticks: number[] = []
    for (let tenth = Math.ceil(low / step) * step; tenth <= high; tenth += step) ticks.push(tenth / 10)
    if (ticks.length <= MAX_TICKS) return ticks
  }
  return [Math.round(min * 10) / 10, Math.round(max * 10) / 10]
}

/** Where a weight lies on the chart's vertical axis, in the layout's box. */
export function chartY(layout: Pick<ChartLayout, 'min' | 'max'>, value: number, height: number): number {
  return height - ((value - layout.min) / (layout.max - layout.min)) * height
}
