// Fails if a mobile bundle carries anything that must stay on the server.
//
// grep is not enough here: the bundles are Hermes bytecode, and a plain grep
// silently reports no match for strings that are demonstrably inside. This
// reads the printable strings instead, and decodes every JWT it finds so the
// check is about what a token *is* rather than what it looks like.
//
// Two targets. The default is a development or CI bundle: it must not know the
// production project, so nothing built for testing can write to real data. With
// `--target store` the rule flips: a TestFlight or App Store bundle, and an OTA
// update for one, must talk to production and must not carry staging or a
// developer's local address.

import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const FORBIDDEN_SUBSTRINGS = [
  'SUPABASE_SERVICE_ROLE',
  'service_role',
  'sb_secret',
  'OPENAI_API_KEY',
  'RESEND_API_KEY',
  'TELEGRAM_BOT_TOKEN',
]

const PRODUCTION_PROJECT = 'bczseshsgpzulqynvukg'
const STAGING_PROJECT = 'rclnsbivyulqmvujiopv'
const PRODUCTION_API = 'https://lapka.my'

const TARGETS = {
  development: { forbidden: [PRODUCTION_PROJECT], required: [] },
  store: {
    // No ban on localhost: React Native carries "http://localhost:" for Metro,
    // and Hermes stores strings back to back, so `strings` glues it to whatever
    // follows ("localhost:3000…" appeared from unrelated bytes). The API address
    // is pinned by requiring the production one instead: EXPO_PUBLIC_API_URL is
    // its only source, so a bundle with it cannot also point at a local server.
    forbidden: [STAGING_PROJECT, '192.168.'],
    required: [PRODUCTION_PROJECT, PRODUCTION_API],
  },
}

/** Only a client key may ship. */
const ALLOWED_JWT_ROLES = new Set(['anon'])

function bundles(dir) {
  let found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found = found.concat(bundles(full))
    else if (entry.name.endsWith('.hbc') || entry.name.endsWith('.js')) found.push(full)
  }
  return found
}

function printableStrings(file) {
  return execFileSync('strings', [file], { maxBuffer: 256 * 1024 * 1024 }).toString()
}

function decodeJwtPayload(token) {
  const [, payload] = token.split('.')
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

const args = process.argv.slice(2)
let targetName = 'development'
const targetFlag = args.indexOf('--target')
if (targetFlag !== -1) {
  targetName = args[targetFlag + 1]
  args.splice(targetFlag, 2)
}
const target = TARGETS[targetName]
const roots = args
if (!target || roots.length === 0) {
  process.stderr.write('usage: check-bundle.mjs [--target development|store] <export dir>...\n')
  process.exit(2)
}

const problems = []
let checked = 0

for (const root of roots) {
  let files
  try {
    statSync(root)
    files = bundles(root)
  } catch {
    problems.push(`${root} does not exist; export the bundle first`)
    continue
  }
  if (files.length === 0) problems.push(`${root} contains no bundle`)

  for (const file of files) {
    checked += 1
    const text = printableStrings(file)
    // Required values live in the main bundle only; assets and chunks may lack them.
    if (/\.(hbc|js)$/.test(file) && file.includes('entry')) {
      for (const needle of target.required) {
        if (!text.includes(needle)) problems.push(`${file} does not contain ${needle}`)
      }
    }

    for (const needle of [...FORBIDDEN_SUBSTRINGS, ...target.forbidden]) {
      if (text.includes(needle)) problems.push(`${file} contains ${needle}`)
    }

    for (const token of new Set(text.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+/g) ?? [])) {
      const payload = decodeJwtPayload(token)
      const role = payload?.role ?? 'unreadable'
      if (!ALLOWED_JWT_ROLES.has(role)) problems.push(`${file} carries a JWT with role "${role}"`)
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(`no server-only material in ${checked} bundle file(s), target ${targetName}\n`)
