/**
 * The words of the «Можно ли?» service states, decided apart from the drawing
 * so the rules can be tested (handoff, «Уточнение: поиск, пустые результаты
 * и ошибки»): what a failure card says, and the request the AI question
 * sends — the same one again on «Повторить».
 */

import type { ErrorCode, PetSpecies, SafetyAskInput } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import type { Dictionary } from '@/i18n'
import { errorMessage } from '@/lib/errors'

/** What failed to load: the reference itself, or one answer (an entry, an AI answer). */
export type SafetyFailureOf = 'catalogue' | 'answer'

/**
 * The failure card: «Не удалось загрузить справочник / ответ» and a line
 * under it.
 *
 * The app cannot tell that the phone is offline — a request that got no
 * answer may as well have met a server that is down — so the unknown case
 * says the neutral «Попробуйте ещё раз. Если не получится, проверьте
 * подключение к интернету.» and never «нет сети». The same line goes under
 * a server failure («что-то пошло не так на нашей стороне», a service
 * unavailable): next to «Повторить» the useful word is «try again». Only a
 * code whose own text asks for something else — sign in again, wait, give
 * consent — says that text instead.
 */
export function safetyFailure(t: Dictionary, cause: unknown, of: SafetyFailureOf): { title: string; body: string } {
  const actionable = cause instanceof ApiError && (ACTIONABLE_CODES as readonly string[]).includes(cause.code)
  return {
    title: of === 'catalogue' ? t.safety.loadFailed : t.safety.answerFailed,
    body: actionable ? errorMessage(t, cause, t.safety.failedBody) : t.safety.failedBody,
  }
}

/** API codes whose message tells the person to do something other than retry. */
const ACTIONABLE_CODES = [
  'unauthorized',
  'reauth_required',
  'consent_required',
  'account_deleting',
  'rate_limited',
] as const satisfies readonly ErrorCode[]

/**
 * The AI question for the words and whom they are about: the saved pet when
 * there is one (the server reads its species and notes), the species
 * otherwise. Built from the screen's parameters, so «Повторить» sends exactly
 * what failed — the same words, the same pet.
 */
export function askRequest(query: string, petId: string | null, species: PetSpecies): SafetyAskInput {
  return petId ? { query, pet_id: petId } : { query, species }
}
