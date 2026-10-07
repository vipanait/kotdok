import { describe, expect, it } from 'vitest'
import { addOrientationPolicy, removeScreenOrientation } from './android-orientation'

const MAIN_ACTIVITY = `package my.lapka.app

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "main"
}
`

describe('removeScreenOrientation', () => {
  it('drops the lock from MainActivity and leaves other activities alone', () => {
    const manifest = {
      manifest: {
        application: [
          {
            activity: [
              { $: { 'android:name': '.MainActivity', 'android:screenOrientation': 'portrait', 'android:exported': 'true' } },
              { $: { 'android:name': '.Other', 'android:screenOrientation': 'portrait' } },
            ],
          },
        ],
      },
    }
    const [main, other] = removeScreenOrientation(manifest).manifest.application[0].activity
    expect(main.$).toEqual({ 'android:name': '.MainActivity', 'android:exported': 'true' })
    expect(other.$['android:screenOrientation']).toBe('portrait')
  })
})

describe('addOrientationPolicy', () => {
  it('applies the policy before super.onCreate and on every configuration change', () => {
    const out = addOrientationPolicy(MAIN_ACTIVITY)
    expect(out).toMatch(/applyOrientationPolicy\(resources\.configuration\).*\n\s*super\.onCreate\(null\)/)
    expect(out).toContain('config.smallestScreenWidthDp < 600')
    expect(out).toContain('SCREEN_ORIENTATION_PORTRAIT')
    expect(out).toContain('SCREEN_ORIENTATION_UNSPECIFIED')
    expect(out).toContain('override fun onConfigurationChanged(newConfig: android.content.res.Configuration)')
    // The new members sit inside the class, before its closing brace.
    expect(out.trimEnd().endsWith('}')).toBe(true)
    expect(out.indexOf('getMainComponentName')).toBeLessThan(out.indexOf('private fun applyOrientationPolicy'))
  })

  it('is idempotent, as prebuild without --clean runs it on its own output', () => {
    const once = addOrientationPolicy(MAIN_ACTIVITY)
    expect(addOrientationPolicy(once)).toBe(once)
  })

  it('refuses a MainActivity it does not recognise instead of shipping without the lock', () => {
    expect(() => addOrientationPolicy('class MainActivity : ReactActivity() {}')).toThrow(/super\.onCreate/)
  })
})
