import { describe, expect, it } from 'vitest'
import { palette, tokensCss, urgency } from './tokens'

/**
 * The palette of docs/design/mobile-design-spec.md §4, kept once: the phone's
 * theme reads it directly and the site's custom properties are rendered from
 * it, so neither can drift from the other (the site's hairline and muted text
 * had).
 */
describe('design tokens', () => {
  it('carry the spec’s values', () => {
    expect(palette.canvas).toBe('#FBF6EE')
    expect(palette.line).toBe('#E8DECB')
    expect(palette.muted).toBe('#5B5346')
    expect(palette.faint).toBe('#767062')
    expect(palette.accentPressed).toBe('#095349')
    expect(urgency.urgent).toEqual({ signal: '#A8501B', background: '#FCE9D8' })
  })

  it('render the site’s custom properties, under the names its stylesheets use', () => {
    const css = tokensCss()
    expect(css.startsWith('/*')).toBe(true)
    expect(css).toContain('  --bg: #FBF6EE;\n')
    expect(css).toContain('  --line: #E8DECB;\n')
    expect(css).toContain('  --muted: #5B5346;\n')
    expect(css).toContain('  --faint: #767062;\n')
    expect(css).toContain('  --green-hover: #095349;\n')
    expect(css).toContain('  --orange: #EB8124;\n')
    expect(css).toContain('.emergency { --signal: #A32B1C; --tint: #FBE1DC; }\n')
    expect(css).toContain('.healthy { --signal: #1F6E45; --tint: #DCEEE2; }\n')
    expect(css.endsWith('\n')).toBe(true)
  })
})
