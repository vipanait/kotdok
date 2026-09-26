import { useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg'
import { useText } from '@/i18n'
import { colour, font } from '@/ui/theme'
import { chartLayout, chartTicks, type DatedWeight } from '@lapka/shared'

const HEIGHT = 170
/** Room for the value above a point and the dates below the axis. */
const TOP = 22
const BOTTOM = 26
const LEFT = 34
const RIGHT = 16

/**
 * The weight line: points, their values, three reference lines, the dates.
 *
 * No coloured bands for "normal": the record does not know breed norms, and a
 * red zone would be a diagnosis it cannot make (spec §7.8). The list below the
 * chart carries the same numbers for a screen reader; the chart itself is one
 * labelled image.
 */
export function WeightChart({ points }: { points: readonly DatedWeight[] }) {
  const t = useText()
  const [width, setWidth] = useState(0)

  const plotWidth = Math.max(width - LEFT - RIGHT, 0)
  const plotHeight = HEIGHT - TOP - BOTTOM
  const layout = width > 0 ? chartLayout(points, plotWidth, plotHeight) : null

  const first = points[0]
  const last = points[points.length - 1]
  const label =
    first && last
      ? t.medicalRecord.chartLabel(t.medicalRecord.weight(first.weight_kg), t.medicalRecord.weight(last.weight_kg))
      : ''

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)

  // Round weights, drawn where their labels say (not the axis ends labelled rounded).
  const ticks = layout ? chartTicks(layout.min, layout.max) : []
  const yOf = (value: number) =>
    layout ? TOP + plotHeight - ((value - layout.min) / (layout.max - layout.min)) * plotHeight : 0

  return (
    <View style={styles.box} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label}>
      {layout ? (
        <Svg width={width} height={HEIGHT}>
          {ticks.map((tick) => (
            <Line
              key={`line-${tick}`}
              x1={LEFT}
              x2={width - RIGHT}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke={colour.line}
              strokeWidth={1}
            />
          ))}
          {ticks.map((tick) => (
            <SvgText
              key={`tick-${tick}`}
              x={0}
              y={yOf(tick) + 4}
              fontSize={12}
              fontFamily={font.body}
              fill={colour.faint}
            >
              {t.decimal(tick)}
            </SvgText>
          ))}
          <Polyline
            points={layout.points.map((p) => `${LEFT + p.x},${TOP + p.y}`).join(' ')}
            fill="none"
            stroke={colour.accent}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {layout.points.map((p, index) => (
            <Circle key={`dot-${index}`} cx={LEFT + p.x} cy={TOP + p.y} r={5} fill={colour.accent} />
          ))}
          {layout.points.map((p, index) => (
            <SvgText
              key={`value-${index}`}
              x={LEFT + p.x}
              y={TOP + p.y - 10}
              fontSize={12}
              fontFamily={font.body}
              fill={colour.muted}
              textAnchor={index === 0 ? 'start' : index === layout.points.length - 1 ? 'end' : 'middle'}
            >
              {t.decimal(p.value)}
            </SvgText>
          ))}
          {edgeAndMiddle(layout.points).map(({ point, index }) => (
            <SvgText
              key={`date-${index}`}
              x={LEFT + point.x}
              y={HEIGHT - 6}
              fontSize={12}
              fontFamily={font.body}
              fill={colour.faint}
              textAnchor={index === 0 ? 'start' : index === layout.points.length - 1 ? 'end' : 'middle'}
            >
              {t.dayShort(point.measured_on)}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  )
}

/** Room a short date needs on the axis, in points. */
const DATE_WIDTH = 64

/**
 * Dates under the first and the last point, and under one in the middle only
 * where it does not run into them: two weighings a fortnight apart would
 * print «12 сен» over «25 сен».
 */
function edgeAndMiddle<T extends { x: number }>(points: readonly T[]): Array<{ point: T; index: number }> {
  const last = points.length - 1
  const chosen = [{ point: points[0], index: 0 }]
  if (points.length > 2) {
    const index = Math.floor(last / 2)
    const middle = points[index]
    if (middle.x - points[0].x >= DATE_WIDTH && points[last].x - middle.x >= DATE_WIDTH) {
      chosen.push({ point: middle, index })
    }
  }
  if (last > 0 && points[last].x - points[0].x >= DATE_WIDTH) chosen.push({ point: points[last], index: last })
  return chosen
}

const styles = StyleSheet.create({
  box: { height: HEIGHT, marginTop: 16 },
})
