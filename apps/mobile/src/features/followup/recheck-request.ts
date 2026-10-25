/**
 * «Проверить снова с учётом прошлой», handed from a case's outcome to the
 * check tab.
 *
 * Not a route parameter: the tab stays mounted, and on its way in it empties
 * a form whose check was sent — after a parameter's effect had already chosen
 * the pet, so a second re-check opened on the first pet with no case. The
 * tab takes this on its way in, after that emptying, once.
 *
 * Module state, like `pending-check`: it has to survive a screen, not a
 * restart.
 */

export type RecheckRequest = { caseId: string; petId: string }

let asked: RecheckRequest | null = null

export function askRecheck(request: RecheckRequest): void {
  asked = request
}

/** @returns the re-check asked for since the tab was last opened, and forgets it. */
export function takeRecheck(): RecheckRequest | null {
  const request = asked
  asked = null
  return request
}
