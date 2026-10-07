/**
 * Phones stay portrait; tablets and unfolded foldables turn freely.
 *
 * `orientation: "portrait"` in app.json becomes `android:screenOrientation`
 * on MainActivity. Android 16 ignores that lock on large screens anyway, and
 * Google Play flags it, so on Android the manifest carries no lock at all and
 * MainActivity applies one only where the screen is narrower than 600dp — the
 * same line Android draws between a phone and a large screen. It is applied
 * natively, before the first frame, and again when a foldable opens or closes.
 * iOS keeps `orientation` as it is.
 */
const { withAndroidManifest, withMainActivity } = require('expo/config-plugins')

const LARGE_SCREEN_DP = 600
const MARK = '// lapka:orientation-policy'

function removeScreenOrientation(manifest) {
  const app = manifest.manifest.application?.[0]
  for (const activity of app?.activity ?? []) {
    if (activity.$?.['android:name'] === '.MainActivity') {
      delete activity.$['android:screenOrientation']
    }
  }
  return manifest
}

function addOrientationPolicy(source) {
  if (source.includes(MARK)) return source

  const onCreate = /(\n(\s*)super\.onCreate\((null|savedInstanceState)\))/
  if (!onCreate.test(source)) throw new Error('android-orientation: super.onCreate not found in MainActivity')
  source = source.replace(onCreate, `\n$2applyOrientationPolicy(resources.configuration) ${MARK}$1`)

  const policy = `
  ${MARK}
  // Phones stay portrait; tablets and unfolded foldables turn freely.
  private fun applyOrientationPolicy(config: android.content.res.Configuration) {
    requestedOrientation =
      if (config.smallestScreenWidthDp < ${LARGE_SCREEN_DP}) android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
      else android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
  }

  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    applyOrientationPolicy(newConfig)
  }
`
  const lastBrace = source.lastIndexOf('}')
  return source.slice(0, lastBrace) + policy + source.slice(lastBrace)
}

function withAndroidOrientation(config) {
  config = withAndroidManifest(config, (mod) => {
    mod.modResults = removeScreenOrientation(mod.modResults)
    return mod
  })
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('android-orientation: MainActivity must be Kotlin')
    mod.modResults.contents = addOrientationPolicy(mod.modResults.contents)
    return mod
  })
}

module.exports = withAndroidOrientation
module.exports.removeScreenOrientation = removeScreenOrientation
module.exports.addOrientationPolicy = addOrientationPolicy
