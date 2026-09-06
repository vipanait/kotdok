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
    values[trimmed.slice(0, at).trim()] = unquote(trimmed.slice(at + 1).trim())
  }
  return values
}

/**
 * Drops surrounding quotes. `vercel env pull` writes values quoted, so a key
 * copied from a file it produced arrives as `"eyJ…"`. Left as-is the quotes
 * become part of the key: the checks below would no longer recognise a JWT,
 * wave it through unverified, and Supabase would refuse it with an error that
 * says nothing about quotes.
 */
function unquote(value) {
  const quoted = /^(["'])(.*)\1$/.exec(value)
  return quoted ? quoted[2] : value
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
  // A legacy key carries its role and project, so an obviously wrong one can be
  // named precisely before any request goes out.
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

/**
 * Asks the project itself whether the key opens it.
 *
 * The checks above only work on legacy keys. A newer `sb_secret_…` key is
 * opaque — and so is a typo, or a line of the file pasted by mistake, which
 * would sail past a shape check and fail later as an unexplained 401 from
 * whichever route happened to run first. One request settles it: the endpoint
 * is refused to anything but a service key, so a 200 proves both the role and
 * the project.
 */
async function keyOpensProject() {
  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/users?page=1&per_page=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  return response.status
}

let status
try {
  status = await keyOpensProject()
} catch (cause) {
  stop(
    `Could not reach ${url} to check the key: ${cause instanceof Error ? cause.message : cause}\n` +
      'The site talks to this project for everything, so there is no point starting without it.',
  )
}

if (status !== 200) {
  stop(
    `The Supabase project ${ref} answered ${status} for SUPABASE_SERVICE_ROLE_KEY.\n` +
      'That key is not a service role key for this project. Take it from Project\n' +
      'Settings → API Keys in the staging project, and check nothing was truncated.',
  )
}

console.log(`Serving http://localhost:3000 against the Supabase project ${ref}.`)

spawn('next', ['dev'], {
  cwd: webRoot,
  stdio: 'inherit',
  env: { ...process.env, ...env },
})
  .on('error', (cause) => stop(`Could not start next dev: ${cause.message}`))
  .on('exit', (code) => process.exit(code ?? 0))
