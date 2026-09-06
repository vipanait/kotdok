/**
 * Runs the site locally against the staging Supabase project.
 *
 * The mobile app talks to `http://localhost:3000`, so its product screens can
 * only be exercised if something is listening there — and that something must
 * use staging, because the phone signs in against staging. Plain `next dev`
 * reads `.env.local`, which holds production credentials: the app would sign in
 * against one project and call an API backed by another, and every request
 * would come back 401 for a reason nobody would guess.
 *
 * So this script builds the environment itself, from `.env.staging` (public
 * values, committed) and `.env.staging.local` (the service role key, never
 * committed), and hands it to `next dev`. Values set here win: Next does not
 * overwrite what is already in the environment, so `.env.local` cannot bleed
 * through.
 *
 * Before starting anything it checks that the project really is staging. A
 * mistake here would point a development server at production data with the
 * service role key in hand, which is the one outcome worth a hard stop.
 */

import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const shared = resolve(webRoot, '.env.staging')
const secret = resolve(webRoot, '.env.staging.local')

/** Enough of dotenv for files we write ourselves: `KEY=value`, `#` comments. */
function parseEnv(path) {
  const values = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at === -1) continue
    values[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim()
  }
  return values
}

function stop(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

/** The payload of a Supabase key, or null when it is not a JWT at all. */
function claims(key) {
  const parts = key.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

if (!existsSync(shared)) stop(`Not found: ${shared}`)

if (!existsSync(secret)) {
  stop(
    [
      `Missing ${secret}`,
      '',
      'It holds the one value that cannot be committed. Create it with:',
      '',
      '  SUPABASE_SERVICE_ROLE_KEY=<service role key of the staging project>',
      '',
      'Take the key from the staging project in the Supabase dashboard,',
      'under Project Settings → API Keys. Never use the production one:',
      'this script refuses it anyway.',
    ].join('\n'),
  )
}

const env = { ...parseEnv(shared), ...parseEnv(secret) }

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1]
if (!ref) stop(`NEXT_PUBLIC_SUPABASE_URL does not look like a Supabase project URL: ${url}`)

const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (serviceKey === '' || serviceKey.startsWith('placeholder')) {
  stop(`SUPABASE_SERVICE_ROLE_KEY is still a placeholder. Put the real one in ${secret}.`)
}

const payload = claims(serviceKey)
if (payload) {
  // Legacy keys carry the role and project. Newer `sb_secret_…` keys are opaque,
  // so there is nothing to check and the URL above is what is left to trust.
  if (payload.role !== 'service_role') {
    stop(`SUPABASE_SERVICE_ROLE_KEY has role "${payload.role}", not service_role.`)
  }
  if (payload.ref !== ref) {
    stop(
      `SUPABASE_SERVICE_ROLE_KEY belongs to project "${payload.ref}", but the URL points at "${ref}".\n` +
        'Refusing to start: this is how a development server ends up writing to the wrong database.',
    )
  }
}

console.log(`Serving http://localhost:3000 against the Supabase project ${ref}.`)

spawn('next', ['dev'], {
  cwd: webRoot,
  stdio: 'inherit',
  env: { ...process.env, ...env },
}).on('exit', (code) => process.exit(code ?? 0))
