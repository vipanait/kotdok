/**
 * The words of the «Можно ли?» service states, decided apart from the drawing
 * so the rules can be tested (handoff, «Уточнение: поиск, пустые результаты
 * и ошибки»): what a failure card says, and the request the AI question
 * sends — the same one again on «Повторить».
 */

import type { PetSpecies, SafetyAskInput } from '@lapka/contracts'
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
 * подключение к интернету.» and never «нет сети». Only a failure the server
 * itself explained (an API code, a timeout after it was reached) says that
 * explanation instead.
 */
export function safetyFailure(t: Dictionary, cause: unknown, of: SafetyFailureOf): { title: string; body: string } {
  return {
    title: of === 'catalogue' ? t.safety.loadFailed : t.safety.answerFailed,
    body: errorMessage(t, cause, t.safety.failedBody),
  }
}

/**
 * The AI question for the words and whom they are about: the saved pet when
 * there is one (the server reads its species and notes), the species
 * otherwise. Built from the screen's parameters, so «Повторить» sends exactly
 * what failed — the same words, the same pet.
 */
export function askRequest(query: string, petId: string | null, species: PetSpecies): SafetyAskInput {
  return petId ? { query, pet_id: petId } : { query, species }
}
