// `npm audit --audit-level=high`, minus advisories that were looked at and
// accepted because no fixed release can be installed.
//
// Each entry names one advisory, why it is accepted and when to look again.
// Anything else at high or critical still fails the job, including a new
// advisory against the same package. An entry with `paths` accepts the
// advisory only while every vulnerable copy is installed at one of them, so a
// fixed copy elsewhere in the tree going back to a vulnerable release fails.

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const ACCEPTED = [
  {
    url: 'https://github.com/advisories/GHSA-qr28-fpjm-wq7f',
    package: 'decode-uri-component',
    paths: ['node_modules/decode-uri-component'],
    reason:
      'Fixed only in 0.5.1, which is ESM-only; query-string 7.1.3 (the last 7.x, pinned by expo-router 57) requires ^0.2.2 and calls it as a CommonJS function, and query-string 10 drops it but uses v-flag regexes that Hermes cannot run. Unlike the others this one IS in the app bundle: expo-router parses route query strings with it. Availability only: a crafted URL of hundreds of KB that the user opens can stall the JS thread until the app is restarted; no data is exposed, and the web server never loads it. expo-router 58 (SDK 58) no longer depends on query-string.',
    review: '2026-11-25',
  },
  {
    url: 'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5',
    package: 'zod',
    paths: ['node_modules/@expo/cli/node_modules/zod'],
    reason:
      'Fixed only in zod 4.6.6; @expo/cli (up to 58.x) pins zod ^3.25.76, which has no fixed release. It validates dev-tools plugin manifests in the Expo dev server on a developer machine; never in the app bundle or the web server. Our own zod is 4.6.7.',
    review: '2026-11-25',
  },
]

const BLOCKING = new Set(['high', 'critical'])

/** The advisories in an `npm audit --json` report that still fail the job. */
export function blockingAdvisories(report, accepted = ACCEPTED) {
  const isAccepted = (url, nodes = []) =>
    accepted.some(
      (entry) => entry.url === url && (!entry.paths || nodes.every((node) => entry.paths.includes(node))),
    )
  const found = new Map()
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      // A string names another vulnerable package; the advisory is listed there.
      if (typeof via !== 'object') continue
      if (!BLOCKING.has(via.severity) || isAccepted(via.url, vulnerability.nodes)) continue
      found.set(via.url, { package: name, severity: via.severity, title: via.title, url: via.url })
    }
  }
  return [...found.values()]
}

function main() {
  let raw
  try {
    raw = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (error) {
    // npm audit exits non-zero whenever anything is found; the report is still on stdout.
    raw = error.stdout
  }
  const blocking = blockingAdvisories(JSON.parse(raw))

  for (const entry of ACCEPTED) {
    console.log(`accepted until ${entry.review}: ${entry.package} ${entry.url}`)
  }
  if (blocking.length === 0) {
    console.log('no other high or critical advisories')
    return
  }
  for (const advisory of blocking) {
    console.error(`${advisory.severity}: ${advisory.package} — ${advisory.title} (${advisory.url})`)
  }
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
