import { describe, expect, it } from 'vitest'
import { GUARD_KEY, createBackGuard, type HistoryPort } from '@/features/forms/back-guard'

/**
 * A browser history in miniature: entries with an address and a state, and
 * a cursor. `back`/`go` move the cursor the way the browser does and call
 * `onPop` like a popstate would — and, like the browser, do nothing at all
 * when the step is out of range; `push` drops what was ahead of the cursor.
 */
function fakeHistory(start: string[]) {
  const entries = start.map((href) => ({ href, state: { __NA: true, href } as Record<string, unknown> }))
  let cursor = entries.length - 1
  let onPop: () => void = () => {}
  const port: HistoryPort = {
    get state() {
      return entries[cursor].state
    },
    pushState(data) {
      entries.splice(cursor + 1)
      entries.push({ href: entries[cursor].href, state: data as Record<string, unknown> })
      cursor += 1
    },
    back() {
      this.go(-1)
    },
    go(delta) {
      const to = cursor + delta
      if (to < 0 || to >= entries.length) return
      cursor = to
      onPop()
    },
    href: () => entries[cursor].href,
    length: () => entries.length,
  }
  return {
    port,
    listen: (handler: () => void) => {
      onPop = handler
    },
    /** Next's own navigation: `replace` swaps the current entry, `push` adds one. */
    navigate(href: string, how: 'push' | 'replace') {
      if (how === 'push') {
        entries.splice(cursor + 1)
        entries.push({ href, state: { __NA: true, href } })
        cursor += 1
      } else {
        entries[cursor] = { href, state: { __NA: true, href } }
      }
    },
    /** A jump within the page (`<a href="#main">`): a new entry, no state — the browser's, not Next's. */
    jump(hash: string) {
      entries.splice(cursor + 1)
      entries.push({ href: `${entries[cursor].href.split('#')[0]}${hash}`, state: null as unknown as Record<string, unknown> })
      cursor += 1
      onPop()
    },
    addresses: () => entries.map((entry) => entry.href),
    here: () => entries[cursor].href,
    cursorAt: () => cursor,
  }
}

describe('the browser Back button over a form with changes (MW-09)', () => {
  it('holds Back once the form has changes: the page stays and asks', () => {
    const history = fakeHistory(['/pets/1/health/vaccinations', '/pets/1/health/new?type=vaccination'])
    const guard = createBackGuard(history.port)
    const asked: string[] = []
    history.listen(() => asked.push(guard.popped()))

    guard.arm()
    // A copy of the form's own entry, same address, marked.
    expect(history.addresses()).toEqual(['/pets/1/health/vaccinations', '/pets/1/health/new?type=vaccination', '/pets/1/health/new?type=vaccination'])
    expect(history.port.state).toMatchObject({ __NA: true, [GUARD_KEY]: true })

    history.port.back()
    expect(asked).toEqual(['ask'])
    // Still on the form.
    expect(history.here()).toBe('/pets/1/health/new?type=vaccination')
  })

  it('asks again on a second Back once the copy is back on top', () => {
    const history = fakeHistory(['/a', '/form'])
    const guard = createBackGuard(history.port)
    const asked: string[] = []
    history.listen(() => asked.push(guard.popped()))
    guard.arm()
    history.port.back()
    guard.arm() // the hook puts the copy back after the popstate
    history.port.back()
    expect(asked).toEqual(['ask', 'ask'])
    expect(history.here()).toBe('/form')
  })

  it('«Уйти» after Back goes to the page before the form, past both of its entries', () => {
    const history = fakeHistory(['/a', '/form'])
    const guard = createBackGuard(history.port)
    history.listen(() => guard.popped())
    guard.arm()
    history.port.back()
    guard.arm()
    guard.goBack()
    expect(history.here()).toBe('/a')
    // Nothing more is held: the page is gone.
    expect(guard.popped()).toBe('pass')
  })

  it('a save replaces the copy with the next page: Back from there is the form, then the page before', () => {
    const history = fakeHistory(['/a', '/form'])
    const guard = createBackGuard(history.port)
    guard.arm()
    guard.disarm() // saving
    expect(guard.leave()).toBe('replace')
    history.navigate('/a?saved=added', 'replace')
    expect(history.addresses()).toEqual(['/a', '/form', '/a?saved=added'])
  })

  it('a form left without changes pushes as usual', () => {
    const history = fakeHistory(['/a', '/form'])
    const guard = createBackGuard(history.port)
    expect(guard.leave()).toBe('push')
    expect(history.addresses()).toEqual(['/a', '/form'])
  })

  it('a form clean again stops asking, and a Back that reaches the copy goes on', () => {
    const history = fakeHistory(['/a', '/form'])
    const guard = createBackGuard(history.port)
    const seen: string[] = []
    history.listen(() => seen.push(guard.popped()))
    guard.arm()
    guard.disarm()
    history.port.back()
    // The hook goes back once more: one press of Back.
    expect(seen).toEqual(['skip'])
    history.port.back()
    expect(history.here()).toBe('/a')
    expect(seen).toEqual(['skip', 'pass'])
  })

  it('puts one copy only, however often the form changes', () => {
    const history = fakeHistory(['/a', '/form'])
    const guard = createBackGuard(history.port)
    guard.arm()
    guard.disarm()
    guard.arm()
    guard.arm()
    expect(history.addresses()).toEqual(['/a', '/form', '/form'])
  })

  it('a form taken away while the page stays takes its copy back off', () => {
    const history = fakeHistory(['/a', '/form'])
    const guard = createBackGuard(history.port)
    history.listen(() => {})
    guard.arm()
    guard.drop()
    expect(history.cursorAt()).toBe(1)
    expect(guard.armed).toBe(false)
  })

  it('lets a Back to another address pass: the page is left', () => {
    const history = fakeHistory(['/a', '/form'])
    const guard = createBackGuard(history.port)
    guard.arm()
    history.navigate('/elsewhere', 'push')
    expect(guard.popped()).toBe('pass')
  })
})

describe('a form that is the tab’s first entry (MW-09 final review)', () => {
  it('opened in a new tab: «Уйти» after Back cannot go back — the guard says so and leaves history alone', () => {
    const history = fakeHistory(['/form'])
    const guard = createBackGuard(history.port)
    const seen: string[] = []
    history.listen(() => seen.push(guard.popped()))
    guard.arm()
    history.port.back()
    expect(seen).toEqual(['ask'])
    guard.arm()
    expect(history.addresses()).toEqual(['/form', '/form'])
    // go(-2) would be ignored by the browser: nothing is done, the caller leaves by address.
    expect(guard.goBack()).toBe(false)
    expect(history.addresses()).toEqual(['/form', '/form'])
    expect(history.cursorAt()).toBe(1)
    // Still the form's guard: leaving by a link replaces the copy.
    expect(guard.leave()).toBe('replace')
  })

  it('a page of another site before the form counts: «Уйти» goes back to it', () => {
    const history = fakeHistory(['https://search.example/?q=lapka', '/form'])
    const guard = createBackGuard(history.port)
    history.listen(() => guard.popped())
    guard.arm()
    history.port.back()
    guard.arm()
    expect(guard.goBack()).toBe(true)
    expect(history.here()).toBe('https://search.example/?q=lapka')
  })

  it('reached with pages ahead of it (Back to the form, then typed): the push drops them, the count is right', () => {
    const history = fakeHistory(['/form', '/elsewhere'])
    history.port.back()
    const guard = createBackGuard(history.port)
    history.listen(() => guard.popped())
    guard.arm()
    expect(history.addresses()).toEqual(['/form', '/form'])
    history.port.back()
    guard.arm()
    expect(guard.goBack()).toBe(false)
  })
})

describe('a jump within the page over the copy (MW-09 final review)', () => {
  it('the skip link on top of the copy, then Back: still the copy — nothing asks, no second copy, «Уйти» leaves', () => {
    const history = fakeHistory(['/a', '/form'])
    const guard = createBackGuard(history.port)
    const seen: string[] = []
    history.listen(() => seen.push(guard.popped()))
    guard.arm()
    history.jump('#main')
    history.port.back()
    // Back from '#main' lands on the copy: not the form's own entry.
    expect(seen).toEqual(['pass', 'pass'])
    expect(guard.armed).toBe(true)
    guard.arm()
    expect(history.addresses()).toEqual(['/a', '/form', '/form', '/form#main'])
    // The next Back is the form's own entry: it asks, and «Уйти» goes past both.
    history.port.back()
    expect(seen.at(-1)).toBe('ask')
    guard.arm()
    expect(guard.goBack()).toBe(true)
    expect(history.here()).toBe('/a')
  })
})
