/**
 * The browser's Back button over a form with unsaved changes (MW-09). The
 * App Router offers no way to hold a Back (`<Link onNavigate>` covers links
 * only, see node_modules/next/dist/docs, «Link», `onNavigate`), so the form
 * keeps one extra history entry — a copy of its own, same address — while
 * it has changes. Back lands on the form's own entry first: the page stays,
 * the guard puts its copy back and the form asks. Kept apart from React and
 * the DOM so the history it leaves behind is unit tested.
 *
 * - a form that is saved or left on purpose leaves no extra entry behind:
 *   going away replaces the copy — also when the form is clean again by
 *   then (changed, then changed back) and left through a link or «Отмена»;
 *   a form that is clean again stops asking, and a Back that reaches the
 *   copy then simply goes on;
 * - a reload on the copy does not make it a second form entry for good: the
 *   page recognises its copy (`adopt`) and counts it once. Next rewrites
 *   `history.state` on a reload, so the copy is also remembered for the tab
 *   (`CopyMemo`: the Navigation API's entry key where there is one);
 * - «Уйти» after Back goes back past both entries of the form.
 */

/** The part of `window.history` and `location` the guard uses. */
export type HistoryPort = {
  readonly state: unknown
  pushState(data: unknown, unused: string): void
  back(): void
  go(delta: number): void
  href(): string
}

/**
 * Remembers, for this tab, which history entry is the copy — so a reload on
 * it can tell (Next replaces `history.state` on load, dropping `GUARD_KEY`).
 */
export type CopyMemo = {
  /** The current entry is the copy just put there. */
  remember(): void
  /** Whether the current entry is the copy remembered. */
  isCopy(): boolean
  forget(): void
}

const NO_MEMO: CopyMemo = { remember() {}, isCopy: () => false, forget() {} }

/** Marks the extra entry in `history.state` (for whoever reads it in devtools). */
export const GUARD_KEY = '__lapkaLeaveGuard'

export type BackGuard = {
  /** The copy is in history, on top of the form's own entry. */
  readonly armed: boolean
  /** The form has changes: put the copy on top, once, and hold Back. */
  arm(): void
  /**
   * The form is clean again, or saving: Back is no longer held. The copy
   * stays — taking it off now could race the next page's entry — and is
   * skipped over if Back reaches it.
   */
  disarm(): void
  /**
   * A popstate. `ask`: Back from the copy onto the form's own entry while
   * held — the page stays and asks. `skip`: the same, but not held — go
   * back once more, the owner pressed Back once. `pass`: anything else.
   */
  popped(): 'ask' | 'skip' | 'pass'
  /** Leaving on purpose to another page: `replace` the copy when it is on top, so it is not left behind. */
  leave(): 'replace' | 'push'
  /** «Уйти» after Back: past the form's entries, to the page before it. */
  goBack(): void
  /** The form is gone while the page stayed: take the copy back off. */
  drop(): void
  /**
   * On opening: the page was reloaded on the copy (its `history.state`
   * says so). The copy is taken as this form's, not held — nothing is typed
   * yet — so it is replaced or skipped like one put there by `arm`.
   */
  adopt(): void
}

/** Whether a history entry is the copy a guard put there. */
export function isGuardEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[GUARD_KEY] === true
}

export function createBackGuard(port: HistoryPort, memo: CopyMemo = NO_MEMO): BackGuard {
  /** Where the copy was put; null when there is none. */
  let armedAt: string | null = null
  let held = false
  let leaving = false
  return {
    get armed() {
      return armedAt !== null
    },
    arm() {
      if (leaving) return
      held = true
      if (armedAt !== null) return
      const state = typeof port.state === 'object' && port.state !== null ? port.state : {}
      port.pushState({ ...state, [GUARD_KEY]: true }, '')
      armedAt = port.href()
      memo.remember()
    },
    disarm() {
      held = false
    },
    popped() {
      if (leaving || armedAt === null || port.href() !== armedAt) return 'pass'
      armedAt = null
      memo.forget()
      return held ? 'ask' : 'skip'
    },
    leave() {
      leaving = true
      const how = armedAt !== null ? 'replace' : 'push'
      armedAt = null
      memo.forget()
      return how
    },
    goBack() {
      leaving = true
      port.go(armedAt !== null ? -2 : -1)
      armedAt = null
      memo.forget()
    },
    drop() {
      if (armedAt === null || leaving) return
      const at = armedAt
      armedAt = null
      held = false
      memo.forget()
      if (port.href() === at) port.back()
    },
    adopt() {
      if (armedAt !== null || leaving) return
      if (!isGuardEntry(port.state) && !memo.isCopy()) return
      armedAt = port.href()
      held = false
    },
  }
}
