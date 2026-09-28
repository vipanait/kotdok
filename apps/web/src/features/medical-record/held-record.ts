/**
 * An edit form over a record that is refreshed underneath it (MW-09), as
 * plain state apart from React so its rules are unit tested:
 *
 * - the form starts from the record once; a refresh that brings the same
 *   record changes nothing;
 * - while nothing is typed, a changed record replaces the form's values (a
 *   new `version` re-keys the form), and a deleted or finished one shows its
 *   own screen instead — nothing is lost;
 * - once the owner has typed, the form is never re-initialised or swapped:
 *   it keeps what it opened with and the edits, and `drift` says what
 *   happened meanwhile, for the page to tell the owner;
 * - the owner may drop the edits and take the new data (`takeFresh`).
 */

/** What the latest load says about the record the form edits. */
export type Fresh<T> =
  | { kind: 'open'; record: T }
  /** Deleted meanwhile. */
  | { kind: 'gone' }
  /** Done or finished meanwhile: only read from now on. */
  | { kind: 'closed' }

/**
 * What happened to the record while the owner typed. `ended`: not another
 * device — a course whose last day passed at midnight (the page tells it
 * apart, `courseDrift`); it is finished now and only read.
 */
export type Drift = 'changed' | 'gone' | 'closed' | 'ended'

/** The record the form was started from; `version` keys the form. */
export type HeldState<T> = { record: T | null; version: number }

export const NOTHING_HELD: HeldState<never> = { record: null, version: 0 }

/** Two loads of a record say the same thing: their JSON is the same. */
export function sameRecord(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * The state after a load. Returns the very same `state` object when nothing
 * changes, so a caller can tell. `dirty`: the owner has typed (or is saving).
 */
export function holdRecord<T>(
  state: HeldState<T>,
  fresh: Fresh<T>,
  dirty: boolean,
  same: (a: T, b: T) => boolean = sameRecord,
): { state: HeldState<T>; drift: Drift | null } {
  if (state.record === null) {
    if (fresh.kind !== 'open') return { state, drift: null }
    return { state: { record: fresh.record, version: state.version + 1 }, drift: null }
  }
  if (fresh.kind === 'open' && same(state.record, fresh.record)) return { state, drift: null }
  if (!dirty) {
    return {
      state: fresh.kind === 'open' ? { record: fresh.record, version: state.version + 1 } : { record: null, version: state.version },
      drift: null,
    }
  }
  return { state, drift: fresh.kind === 'open' ? 'changed' : fresh.kind }
}

/** The owner drops the edits: the form starts over from the latest load, or the page shows what became of the record. */
export function takeFresh<T>(state: HeldState<T>, fresh: Fresh<T>): HeldState<T> {
  return { record: fresh.kind === 'open' ? fresh.record : null, version: state.version + 1 }
}
