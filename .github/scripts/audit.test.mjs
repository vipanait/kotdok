import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blockingAdvisories } from './audit.mjs'

const advisory = (url, severity, title = 'x') => ({ url, severity, title })

const accepted = [{ url: 'https://github.com/advisories/GHSA-accepted', package: 'braces', reason: '', review: '' }]

test('an accepted advisory, and the packages that only depend on it, do not fail the job', () => {
  const report = {
    vulnerabilities: {
      braces: { via: [advisory('https://github.com/advisories/GHSA-accepted', 'high')] },
      micromatch: { via: ['braces'] },
    },
  }
  assert.deepEqual(blockingAdvisories(report, accepted), [])
})

test('any other high or critical advisory fails it, also on an accepted package', () => {
  const report = {
    vulnerabilities: {
      braces: {
        via: [
          advisory('https://github.com/advisories/GHSA-accepted', 'high'),
          advisory('https://github.com/advisories/GHSA-new', 'critical', 'new one'),
        ],
      },
    },
  }
  assert.deepEqual(blockingAdvisories(report, accepted), [
    { package: 'braces', severity: 'critical', title: 'new one', url: 'https://github.com/advisories/GHSA-new' },
  ])
})

test('moderate and low advisories stay below the line, as with --audit-level=high', () => {
  const report = { vulnerabilities: { uuid: { via: [advisory('https://github.com/advisories/GHSA-m', 'moderate')] } } }
  assert.deepEqual(blockingAdvisories(report, accepted), [])
})

test('an advisory accepted for some paths fails the job once a copy elsewhere is vulnerable', () => {
  const scoped = [{ url: 'https://github.com/advisories/GHSA-scoped', package: 'zod', paths: ['node_modules/a/node_modules/zod'] }]
  const report = (nodes) => ({
    vulnerabilities: { zod: { nodes, via: [advisory('https://github.com/advisories/GHSA-scoped', 'high', 'scoped')] } },
  })
  assert.deepEqual(blockingAdvisories(report(['node_modules/a/node_modules/zod']), scoped), [])
  assert.deepEqual(blockingAdvisories(report(['node_modules/a/node_modules/zod', 'node_modules/zod']), scoped), [
    { package: 'zod', severity: 'high', title: 'scoped', url: 'https://github.com/advisories/GHSA-scoped' },
  ])
})
