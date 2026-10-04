// `npm audit --audit-level=high`, minus advisories that were looked at and
// accepted because no fixed release exists.
//
// Each entry names one advisory, why it is accepted and when to look again.
// Anything else at high or critical still fails the job, including a new
// advisory against the same package.

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const ACCEPTED = [
  {
    url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
    package: 'braces',
    reason:
      'Every published version is affected (<=3.0.3). Reached only through Metro (micromatch in @expo/metro-file-map) at build time; never in the app bundle.',
    review: '2026-11-04',
  },
  {
    url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
    package: 'node-forge',
    reason:
      'Every published version is affected (<=1.4.0). Reached only through @expo/cli and the expo-updates code-signing tooling on a developer machine or CI; never in the app bundle.',
    review: '2026-11-04',
  },
]

const BLOCKING = new Set(['high', 'critical'])

/** The advisories in an `npm audit --json` report that still fail the job. */
export function blockingAdvisories(report, accepted = ACCEPTED) {
  const allowed = new Set(accepted.map((entry) => entry.url))
  const found = new Map()
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      // A string names another vulnerable package; the advisory is listed there.
      if (typeof via !== 'object') continue
      if (!BLOCKING.has(via.severity) || allowed.has(via.url)) continue
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
