// Decides which CI groups a change set has to run (plan item 0.1/05).
//
// Kept out of the workflow YAML so the routing can be tested without pushing a
// branch and watching GitHub.

/** Paths that force both groups: shared code and anything about how we build. */
const BOTH = [
  /^packages\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^\.github\/workflows\//,
  /^\.github\/scripts\//,
]

const WEB_ONLY = [/^apps\/web\//, /^supabase\//]
const MOBILE_ONLY = [/^apps\/mobile\//]

/**
 * @param {string[]} files paths relative to the repository root
 * @returns {{web: boolean, mobile: boolean}}
 */
export function changedGroups(files) {
  const matches = (patterns) => files.some((file) => patterns.some((p) => p.test(file)))
  const both = matches(BOTH)

  return {
    web: both || matches(WEB_ONLY),
    mobile: both || matches(MOBILE_ONLY),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2).filter(Boolean)
  const groups = changedGroups(files)
  process.stdout.write(`web=${groups.web}\nmobile=${groups.mobile}\n`)
}
