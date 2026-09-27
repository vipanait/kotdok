import { createBackGuard, type CopyMemo, type HistoryPort } from './back-guard'

/** `leaveHref` when the owner pressed the browser's Back: «Уйти» goes back, not to an address. */
export const LEAVE_BACK = 'lapka:back'

/** The part of Next's router the guard navigates with. */
export type LeaveRouter = {
  push(href: string): void
  replace(href: string): void
  refresh(): void
}

/**
 * Everything `useLeaveGuard` decides, as plain state apart from React and
 * the DOM so the history a form leaves behind is unit tested scenario by
 * scenario (MW-09): the hook only feeds it the page's events.
 */
export type LeaveGuard = {
  readonly leaving: boolean
  /** The form has changes (or is clean again, or saving). */
  setDirty(dirty: boolean): void
  /**
   * A click on a link to another page of the site. `hold`: the form has
   * changes — ask first. `follow`: the form is clean, but its copy is still
   * in history — the guard leaves itself, replacing the copy. `pass`: let
   * the link do what it does. The caller prevents the click unless `pass`.
   */
  linkClicked(href: string): 'hold' | 'follow' | 'pass'
  /** A popstate. `ask`: Back was pressed over the form's changes — the page stays and asks. */
  popped(): 'ask' | 'none'
  /** The way out once the form is done; `LEAVE_BACK` goes back past the form. */
  leave(href: string): void
  /** The form is on the page (after a reload too). */
  mounted(): void
  /** The form is taken off the page. */
  unmounted(): void
}

export function createLeaveGuard(
  port: HistoryPort,
  router: LeaveRouter,
  later: (run: () => void) => void,
  memo?: CopyMemo,
  /**
   * True once per loaded document, for the first form guard that asks
   * (`documentFirstMount`). Only that one may take a copy already in history
   * as its own: after a reload on the copy, nothing else put it there. A form
   * re-keyed on a page that stays (new data taken, «Загрузить новые данные»)
   * is a second mount in the same document — the copy there is the old
   * form's, which takes it back itself (`unmounted`); adopting it too made
   * both act on it and Back left the form (MW-09 fix round 2).
   */
  firstOnDocument: () => boolean = () => true,
): LeaveGuard {
  const back = createBackGuard(port, memo)
  let dirty = false
  let leaving = false
  /** The form is on the page; React's development double mount takes it off and puts it back at once. */
  let onPage = false

  const guard: LeaveGuard = {
    get leaving() {
      return leaving
    },
    setDirty(next) {
      dirty = next
      if (leaving) return
      if (next) back.arm()
      else back.disarm()
    },
    linkClicked(href) {
      if (leaving) return 'pass'
      if (dirty) return 'hold'
      if (!back.armed) return 'pass'
      // Changed, then changed back: nothing to ask, but the copy must not stay behind.
      guard.leave(href)
      return 'follow'
    },
    popped() {
      if (leaving) return 'none'
      const seen = back.popped()
      if (seen === 'skip') {
        // The copy of a form that is clean again: the owner pressed Back once.
        port.back()
        return 'none'
      }
      if (seen !== 'ask') return 'none'
      // The page stays; the copy goes back on top once Next has settled this entry.
      later(() => {
        if (!leaving) back.arm()
      })
      return 'ask'
    },
    leave(href) {
      leaving = true
      if (href === LEAVE_BACK) {
        back.goBack()
        return
      }
      // The copy on top is replaced by the next page, not left behind for Back to find.
      if (back.leave() === 'replace') router.replace(href)
      else router.push(href)
      router.refresh()
    },
    mounted() {
      onPage = true
      // Reloaded on the copy: it is this form's, counted once — only on the
      // document's first form mount (React's development double mount keeps
      // this guard, already holding the copy).
      if (firstOnDocument()) back.adopt()
    },
    unmounted() {
      onPage = false
      // A form taken away while its copy is in history (re-keyed with new data,
      // say) takes the copy back — unless the page has moved on, or the form
      // is back on the page already (React's development double mount).
      if (!back.armed || leaving) return
      const here = port.href()
      later(() => {
        if (!onPage && port.href() === here) back.drop()
      })
    },
  }
  return guard
}
