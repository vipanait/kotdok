import { describe, expect, it } from 'vitest'
import { GUARD_KEY, type HistoryPort } from '@/features/forms/back-guard'
import { LEAVE_BACK, createLeaveGuard, type LeaveGuard } from '@/features/forms/leave-guard'

/**
 * A browser tab in miniature: history entries with an address and a state,
 * a cursor, Next's router pushing and replacing, a reload that keeps the
 * history and starts the page over — and the page's form guard fed the
 * events the hook (`useLeaveGuard`) feeds it.
 */
let nextId = 0
type Entry = { id: number; href: string; state: Record<string, unknown> }
const entry = (href: string, state: Record<string, unknown> = { __NA: true }): Entry => ({ id: nextId++, href, state })

function tab(start: string[]) {
  const entries: Entry[] = start.map((href) => entry(href))
  /** The tab's sessionStorage: which entry (by its Navigation API key) is the copy. */
  let remembered: number | null = null
  const memo = {
    remember: () => void (remembered = entries[cursor].id),
    isCopy: () => remembered === entries[cursor].id,
    forget: () => void (remembered = null),
  }
  let cursor = entries.length - 1
  const pending: Array<() => void> = []
  /** The guards on the page — their popstate listeners are the window's. */
  const onPage = new Set<LeaveGuard>()
  /** The document's first form mount (`documentFirstMount`): a reload starts it over. */
  let claimed = false
  const firstOnDocument = () => (claimed ? false : (claimed = true))

  const port: HistoryPort = {
    get state() {
      return entries[cursor].state
    },
    pushState(data) {
      entries.splice(cursor + 1)
      entries.push(entry(entries[cursor].href, data as Record<string, unknown>))
      cursor += 1
    },
    back() {
      this.go(-1)
    },
    go(delta) {
      // Out of range, the browser does nothing at all — no move, no popstate.
      const to = cursor + delta
      if (to < 0 || to >= entries.length) return
      cursor = to
      // The popstate reaches every form guard on the page.
      if (entries[cursor].href === formHref) for (const guard of [...onPage]) popped.push(guard.popped())
    },
    href: () => entries[cursor].href,
    length: () => entries.length,
  }
  const router = {
    push(href: string) {
      entries.splice(cursor + 1)
      entries.push(entry(href))
      cursor += 1
      onPage.clear()
    },
    replace(href: string) {
      // A replace keeps the slot (and its Navigation API key).
      entries[cursor] = { ...entries[cursor], href, state: { __NA: true } }
      onPage.clear()
    },
    refresh() {},
  }
  let formHref = entries[cursor].href
  const popped: string[] = []

  function open() {
    formHref = entries[cursor].href
    const guard = createLeaveGuard(port, router, (run) => pending.push(run), () => '/section', memo, firstOnDocument)
    onPage.add(guard)
    guard.mounted()
    return guard
  }

  return {
    open,
    /** The form's page is loaded again, on whatever entry is current — and Next rewrites its state, as it does. */
    reload() {
      entries[cursor] = { ...entries[cursor], state: { __NA: true } }
      onPage.clear()
      claimed = false
      return open()
    },
    /**
     * The page stays and the form is re-keyed (new data taken): React runs
     * the old form's cleanup, then the new form's effects, in one commit.
     */
    rekey(old: LeaveGuard) {
      onPage.delete(old)
      old.unmounted()
      return open()
    },
    back: () => port.back(),
    /** Timers that ran (the copy put back after a Back). */
    settle: () => pending.splice(0).forEach((run) => run()),
    here: () => entries[cursor].href,
    addresses: () => entries.map((entry) => entry.href),
    copies: () => entries.filter((entry) => entry.state[GUARD_KEY] === true).length,
    popped,
  }
}

describe('the leave guard over a whole visit to a form (MW-09 fix round 1)', () => {
  it('type, clear, «Отмена», Back: the form is in history once', () => {
    const t = tab(['/section', '/form'])
    const form = t.open()
    form.setDirty(true)
    form.setDirty(false)
    // «Отмена» is a link: the clean form with its copy still in history leaves through the guard.
    expect(form.linkClicked('/section')).toBe('follow')
    expect(t.addresses()).toEqual(['/section', '/form', '/section'])
    t.back()
    expect(t.here()).toBe('/form')
    t.back()
    expect(t.here()).toBe('/section')
  })

  it('a clean form never put a copy: its links are left alone', () => {
    const t = tab(['/section', '/form'])
    const form = t.open()
    expect(form.linkClicked('/section')).toBe('pass')
    expect(t.addresses()).toEqual(['/section', '/form'])
  })

  it('a form with changes holds its links and asks', () => {
    const t = tab(['/section', '/form'])
    const form = t.open()
    form.setDirty(true)
    expect(form.linkClicked('/section')).toBe('hold')
    form.leave('/section')
    expect(t.addresses()).toEqual(['/section', '/form', '/section'])
  })

  it('type, reload, type, Back, «Уйти»: the page before the form, not the form again', () => {
    const t = tab(['/section', '/form'])
    t.open().setDirty(true)
    expect(t.addresses()).toEqual(['/section', '/form', '/form'])
    // F5 on the copy: the page starts over, and recognises its copy.
    const reloaded = t.reload()
    // Next dropped the mark; the tab still knows which entry the copy is.
    expect(t.copies()).toBe(0)
    reloaded.setDirty(true)
    expect(t.addresses()).toEqual(['/section', '/form', '/form'])
    t.back()
    expect(t.popped).toEqual(['ask'])
    t.settle()
    reloaded.leave(LEAVE_BACK)
    expect(t.here()).toBe('/section')
  })

  it('type, reload, Back with nothing typed: one press leaves', () => {
    const t = tab(['/section', '/form'])
    t.open().setDirty(true)
    t.reload()
    t.back()
    // The copy was skipped over: the owner is on the page before the form.
    expect(t.here()).toBe('/section')
  })

  it('type, reload, clear link: the copy is replaced, not left behind', () => {
    const t = tab(['/section', '/form'])
    t.open().setDirty(true)
    const reloaded = t.reload()
    expect(reloaded.linkClicked('/elsewhere')).toBe('follow')
    expect(t.addresses()).toEqual(['/section', '/form', '/elsewhere'])
  })

  it('a form taken off and put back at once (React’s development double mount) keeps its copy', () => {
    const t = tab(['/section', '/form'])
    t.open().setDirty(true)
    const reloaded = t.reload()
    reloaded.unmounted()
    reloaded.mounted()
    t.settle()
    expect(t.here()).toBe('/form')
    expect(t.addresses()).toEqual(['/section', '/form', '/form'])
    reloaded.setDirty(true)
    t.back()
    t.settle()
    reloaded.leave(LEAVE_BACK)
    expect(t.here()).toBe('/section')
  })

  it('a form taken off for good (re-keyed) takes its copy back', () => {
    const t = tab(['/section', '/form'])
    const form = t.open()
    form.setDirty(true)
    form.unmounted()
    t.settle()
    expect(t.here()).toBe('/form')
    expect(t.addresses()[1]).toBe('/form')
  })

  it('Back over changes asks, «Остаться» keeps the form, a second Back asks again', () => {
    const t = tab(['/section', '/form'])
    const form = t.open()
    form.setDirty(true)
    t.back()
    t.settle()
    t.back()
    expect(t.popped).toEqual(['ask', 'ask'])
    expect(t.here()).toBe('/form')
  })
})

describe('a form re-keyed while its copy is in history (MW-09 fix round 2)', () => {
  it('clean but armed, re-keyed with new data: the owner stays on the form, and Back leaves it once', () => {
    const t = tab(['/section', '/form'])
    const old = t.open()
    old.setDirty(true)
    old.setDirty(false)
    const fresh = t.rekey(old)
    t.settle()
    expect(t.here()).toBe('/form')
    expect(t.popped).not.toContain('ask')
    t.back()
    expect(t.here()).toBe('/section')
    expect(fresh.leaving).toBe(false)
  })

  it('«Загрузить новые данные» over typed changes: the owner stays on the form, nothing asks', () => {
    const t = tab(['/section', '/form'])
    const old = t.open()
    old.setDirty(true)
    // takeLatest: the edits are dropped, the form starts over from the new data.
    const fresh = t.rekey(old)
    fresh.setDirty(false)
    t.settle()
    expect(t.here()).toBe('/form')
    expect(t.popped).toEqual(['none'])
    // The new form is clean: one Back leaves.
    t.back()
    expect(t.here()).toBe('/section')
  })

  it('the new form typed in after the re-key holds Back, and «Уйти» goes to the page before the form', () => {
    const t = tab(['/section', '/form'])
    const old = t.open()
    old.setDirty(true)
    const fresh = t.rekey(old)
    t.settle()
    fresh.setDirty(true)
    expect(t.addresses()).toEqual(['/section', '/form', '/form'])
    t.back()
    expect(t.popped.at(-1)).toBe('ask')
    t.settle()
    fresh.leave(LEAVE_BACK)
    expect(t.here()).toBe('/section')
  })
})

describe('a form that is the tab’s first entry: opened in a new tab, from a bookmark, a restored tab (MW-09 final review)', () => {
  it('type, Back, «Уйти»: the form’s back link, replacing the copy — never a button that does nothing', () => {
    const t = tab(['/form'])
    const form = t.open()
    form.setDirty(true)
    expect(t.addresses()).toEqual(['/form', '/form'])
    t.back()
    expect(t.popped).toEqual(['ask'])
    t.settle()
    form.leave(LEAVE_BACK)
    expect(t.here()).toBe('/section')
    // The copy is gone: Back from the section is the form, once.
    expect(t.addresses()).toEqual(['/form', '/section'])
    expect(t.copies()).toBe(0)
  })

  it('«Уйти» pressed before the copy is back on top: the back link all the same', () => {
    const t = tab(['/form'])
    const form = t.open()
    form.setDirty(true)
    t.back()
    form.leave(LEAVE_BACK)
    expect(t.here()).toBe('/section')
    t.settle()
    expect(t.here()).toBe('/section')
  })

  it('type, reload on the copy, type, Back, «Уйти»: the back link', () => {
    const t = tab(['/form'])
    t.open().setDirty(true)
    const reloaded = t.reload()
    reloaded.setDirty(true)
    t.back()
    expect(t.popped).toEqual(['ask'])
    t.settle()
    reloaded.leave(LEAVE_BACK)
    expect(t.here()).toBe('/section')
  })

  it('with a page before it, «Уйти» still goes back, not to the back link', () => {
    const t = tab(['/elsewhere', '/form'])
    const form = t.open()
    form.setDirty(true)
    t.back()
    t.settle()
    form.leave(LEAVE_BACK)
    expect(t.here()).toBe('/elsewhere')
  })
})
