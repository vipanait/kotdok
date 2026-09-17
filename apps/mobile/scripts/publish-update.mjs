// Publishes an over-the-air update to installed store builds.
//
//   npm run update:preview     — TestFlight builds on the preview channel
//   npm run update:production  — App Store builds on the production channel
//
// Both channels talk to production, so the bundle is exported with the EAS
// "production" variables and the local .env files switched off: .env points at
// staging and .env.local at a developer's machine, and either one leaking into
// an update would break the app for everyone who has it installed. The bundle
// is checked with the store rules before anything is uploaded, and the update
// is uploaded from exactly that checked export.

import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const CHANNELS = new Set(['preview', 'production'])
const OUT = 'dist/update'

const channel = process.argv[2]
if (!CHANNELS.has(channel)) {
  process.stderr.write('usage: publish-update.mjs preview|production\n')
  process.exit(2)
}

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

function read(command, args) {
  return execFileSync(command, args).toString().trim()
}

// An update is labelled with its commit; uncommitted changes would ship code
// that no commit describes.
if (read('git', ['status', '--porcelain']) !== '') {
  process.stderr.write('working tree has uncommitted changes; commit them first\n')
  process.exit(1)
}

rmSync(OUT, { recursive: true, force: true })

// --clear: Metro's cache is not keyed on EXPO_PUBLIC_* values, and without it a
// bundle exported earlier against staging comes back unchanged.

run('npx', [
  '-y',
  'eas-cli@latest',
  'env:exec',
  'production',
  `EXPO_NO_DOTENV=1 npx expo export --clear --platform ios --platform android --output-dir ${OUT}`,
  '--non-interactive',
])

run('node', ['scripts/check-bundle.mjs', '--target', 'store', OUT])

const commit = read('git', ['log', '-1', '--format=%h %s'])

run('npx', [
  '-y',
  'eas-cli@latest',
  'update',
  '--channel',
  channel,
  '--environment',
  'production',
  '--skip-bundler',
  '--input-dir',
  OUT,
  '--message',
  commit,
  '--non-interactive',
])
