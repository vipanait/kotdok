import assert from 'node:assert/strict'
import { test } from 'node:test'
import { changedGroups } from './changed-groups.mjs'

test('a web-only change runs only the web group', () => {
  assert.deepEqual(changedGroups(['apps/web/src/app/page.tsx']), { web: true, mobile: false })
})

test('a mobile-only change runs only the mobile group', () => {
  assert.deepEqual(changedGroups(['apps/mobile/src/App.tsx']), { web: false, mobile: true })
})

test('a shared package change runs both consumers', () => {
  assert.deepEqual(changedGroups(['packages/shared/src/index.ts']), { web: true, mobile: true })
})

test('a root lockfile change runs both groups', () => {
  assert.deepEqual(changedGroups(['package-lock.json']), { web: true, mobile: true })
})

test('build settings run both groups', () => {
  assert.deepEqual(changedGroups(['.github/workflows/ci.yml']), { web: true, mobile: true })
  assert.deepEqual(changedGroups(['package.json']), { web: true, mobile: true })
})

test('migrations run the web group, which owns the integration tests', () => {
  assert.deepEqual(changedGroups(['supabase/migrations/20260101000000_init_baseline.sql']), {
    web: true,
    mobile: false,
  })
})

test('documentation alone runs neither group', () => {
  assert.deepEqual(changedGroups(['docs/mobile-api-plan.md', 'README.md']), {
    web: false,
    mobile: false,
  })
})

test('a mixed change set runs both groups', () => {
  assert.deepEqual(changedGroups(['apps/web/src/x.ts', 'apps/mobile/src/App.tsx']), {
    web: true,
    mobile: true,
  })
})

test('an empty change set runs neither group', () => {
  assert.deepEqual(changedGroups([]), { web: false, mobile: false })
})
