// .easignore is a hand copy (pull request #69): EAS reads it INSTEAD of every
// .gitignore, so it repeats the root .gitignore verbatim and the rules of
// supabase/.gitignore under supabase/. Nothing regenerates it, so a rule added
// to either .gitignore and not here would quietly go to Expo with every build.
//
// The documented differences are the file's own sections — the header, the
// local-only paths from .git/info/exclude and the tracked-but-unneeded
// directories — and are not compared.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

/** The lines between `# --- <title> ---` and the next `# --- ` heading, blank lines at the edges dropped. */
export function section(text, title) {
  const lines = text.split('\n')
  const start = lines.indexOf(`# --- ${title} ---`)
  if (start === -1) throw new Error(`.easignore has no "# --- ${title} ---" section`)
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('# --- '))
  return trimBlank(end === -1 ? rest : rest.slice(0, end))
}

function trimBlank(lines) {
  let from = 0
  let to = lines.length
  while (from < to && lines[from].trim() === '') from++
  while (to > from && lines[to - 1].trim() === '') to--
  return lines.slice(from, to)
}

const rules = (lines) => lines.map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'))

const easignore = read('.easignore')

test('.easignore repeats the root .gitignore verbatim', () => {
  assert.equal(
    section(easignore, 'root .gitignore, verbatim').join('\n'),
    trimBlank(read('.gitignore').split('\n')).join('\n'),
    'Copy the root .gitignore into the "root .gitignore, verbatim" section of .easignore.',
  )
})

test('.easignore repeats every supabase/.gitignore rule under supabase/', () => {
  assert.equal(
    rules(section(easignore, 'supabase/.gitignore')).join('\n'),
    rules(read('supabase/.gitignore').split('\n')).map((rule) => `supabase/${rule}`).join('\n'),
    'Mirror supabase/.gitignore, each rule prefixed with supabase/, in the "supabase/.gitignore" section of .easignore.',
  )
})

test('section() reads up to the next heading and ignores blank edges', () => {
  const text = '# head\n# --- a ---\n\nx\ny\n\n# --- b ---\nz\n'
  assert.deepEqual(section(text, 'a'), ['x', 'y'])
  assert.deepEqual(section(text, 'b'), ['z'])
  assert.throws(() => section(text, 'c'), /no "# --- c ---" section/)
})
