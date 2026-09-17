#!/usr/bin/env node
/**
 * Builds the "Secret Key (for OAuth)" value for the Apple provider in Supabase.
 *
 * Apple does not take the .p8 key itself: it takes a short-lived JWT signed
 * with it. The key is read from disk and never leaves this machine; the JWT is
 * printed to stdout only, so it can go straight to the clipboard:
 *
 *   node scripts/apple-client-secret.mjs ~/secure/AuthKey_XXXXXXXXXX.p8 | pbcopy
 *
 * The Key ID is read from the file name Apple gives the key. The result is a
 * secret too: paste it into Supabase and nowhere else. It expires — run this
 * again before the date printed on stderr. Staging and production use separate
 * keys, so each project gets its own run.
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createPrivateKey, sign } from 'node:crypto'

const TEAM_ID = 'KAY8S7KK98'
// The Services ID: only the browser flow (Android, the site) uses this secret.
const CLIENT_ID = 'my.lapka.web'
// Apple refuses anything longer than 15 777 000 seconds (about 182 days).
const LIFETIME_DAYS = 180

const path = process.argv[2]
const named = path && basename(path).match(/^AuthKey_([A-Z0-9]{10})\.p8$/)
if (!named) {
  console.error('Usage: node scripts/apple-client-secret.mjs /path/to/AuthKey_XXXXXXXXXX.p8')
  console.error('The file must keep the name Apple gave it: the Key ID is read from it.')
  process.exit(1)
}
const keyId = named[1]

let key
try {
  key = createPrivateKey(readFileSync(path, 'utf8'))
} catch (cause) {
  console.error(`Could not read a private key from ${path}: ${cause.message}`)
  process.exit(1)
}
if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
  console.error('This is not a Sign in with Apple key (expected EC P-256).')
  process.exit(1)
}

const now = Math.floor(Date.now() / 1000)
const exp = now + LIFETIME_DAYS * 24 * 60 * 60

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const input = `${encode({ alg: 'ES256', kid: keyId })}.${encode({
  iss: TEAM_ID,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: CLIENT_ID,
})}`
// JWT wants the raw r||s signature, not the DER that Node produces by default.
const signature = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })

process.stdout.write(`${input}.${signature.toString('base64url')}`)
process.stderr.write(
  `\nKey ${keyId}. Expires ${new Date(exp * 1000).toISOString().slice(0, 10)} — generate a new one before then.\n`,
)
