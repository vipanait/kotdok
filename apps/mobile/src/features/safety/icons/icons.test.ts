import { describe, expect, it } from 'vitest'
import { SAFETY_ICON_NAMES, type SafetyIconName } from '@lapka/shared'
import apple from '../../../../../web/public/images/safety/apple.svg?raw'
import chocolate from '../../../../../web/public/images/safety/chocolate.svg?raw'
import flower from '../../../../../web/public/images/safety/flower.svg?raw'
import grapes from '../../../../../web/public/images/safety/grapes.svg?raw'
import household from '../../../../../web/public/images/safety/household.svg?raw'
import medicine from '../../../../../web/public/images/safety/medicine.svg?raw'
import milk from '../../../../../web/public/images/safety/milk.svg?raw'
import pills from '../../../../../web/public/images/safety/pills.svg?raw'
import plant from '../../../../../web/public/images/safety/plant.svg?raw'
import appleSource from './Apple.tsx?raw'
import chocolateSource from './Chocolate.tsx?raw'
import flowerSource from './Flower.tsx?raw'
import grapesSource from './Grapes.tsx?raw'
import householdSource from './Household.tsx?raw'
import medicineSource from './Medicine.tsx?raw'
import milkSource from './Milk.tsx?raw'
import pillsSource from './Pills.tsx?raw'
import plantSource from './Plant.tsx?raw'
import frameSource from './frame.tsx?raw'
import safetyIconSource from './SafetyIcon.tsx?raw'

/**
 * The item pictures are transcribed by hand from the design's SVG files into
 * react-native-svg components (no SVG transformer in the bundle). Rendering
 * needs a device, so this guards the transcription instead: every shape, path
 * and colour of the source file is in its component, and every name the
 * shared mapping can return has one.
 */
const DESIGN: Record<SafetyIconName, string> = { apple, chocolate, flower, grapes, household, medicine, milk, pills, plant }
const COMPONENT: Record<SafetyIconName, string> = {
  apple: appleSource,
  chocolate: chocolateSource,
  flower: flowerSource,
  grapes: grapesSource,
  household: householdSource,
  medicine: medicineSource,
  milk: milkSource,
  pills: pillsSource,
  plant: plantSource,
}

function attributes(svg: string, attribute: string): string[] {
  return [...svg.matchAll(new RegExp(`\\s${attribute}="([^"]+)"`, 'g'))].map((match) => match[1])
}

describe('the native item pictures', () => {
  it.each([...SAFETY_ICON_NAMES])('%s keeps every path, shape and colour of its design file', (name) => {
    const svg = DESIGN[name].replace(/^<svg[^>]*>/, '')
    const tsx = COMPONENT[name]
    for (const d of attributes(svg, 'd')) expect(tsx, d).toContain(`d="${d}"`)
    for (const fill of attributes(svg, 'fill')) expect(tsx, fill).toContain(`fill="${fill}"`)
    for (const transform of attributes(svg, 'transform')) expect(tsx).toContain(`transform="${transform}"`)
    for (const attribute of ['x', 'y', 'width', 'height', 'rx', 'cx', 'cy', 'r']) {
      for (const value of attributes(svg, attribute)) expect(tsx, `${attribute}=${value}`).toContain(`${attribute}={${value}}`)
    }
  })

  it('draws them in the outline of the design files', () => {
    for (const name of SAFETY_ICON_NAMES) {
      const head = DESIGN[name].match(/^<svg[^>]*>/)![0]
      expect(head).toContain('viewBox="0 0 52 52"')
      expect(head).toContain('stroke="#4D6557" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"')
    }
    expect(frameSource).toContain('viewBox="0 0 52 52"')
    expect(frameSource).toContain("OUTLINE = '#4D6557'")
    expect(frameSource).toContain('strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"')
  })

  it('maps every name to its component and hides the picture from a screen reader', () => {
    const icon = safetyIconSource
    for (const name of SAFETY_ICON_NAMES) {
      expect(icon).toMatch(new RegExp(`\\b${name}: ${name[0].toUpperCase()}${name.slice(1)},`))
    }
    expect(icon).toContain('accessibilityElementsHidden')
    expect(icon).toContain('importantForAccessibility="no-hide-descendants"')
  })
})
