import { describe, expect, it } from 'vitest'
import { ApiError, ApiTimeoutError } from '@lapka/shared'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import { askRequest, safetyFailure } from './states'

describe('the failure card (handoff, «Уточнение: поиск…»)', () => {
  it('names what failed: the reference or one answer', () => {
    expect(safetyFailure(ru, new TypeError('Network request failed'), 'catalogue').title).toBe('Не удалось загрузить справочник')
    expect(safetyFailure(ru, new TypeError('Network request failed'), 'answer').title).toBe('Не удалось загрузить ответ')
    expect(safetyFailure(en, new TypeError('Network request failed'), 'answer').title).toBe('Could not load the answer')
  })

  it('does not claim the network is down when the cause is unknown: a request with no answer says the neutral line', () => {
    for (const cause of [new TypeError('Network request failed'), new Error('boom'), Object.assign(new Error('aborted'), { name: 'AbortError' })]) {
      const { body } = safetyFailure(ru, cause, 'catalogue')
      expect(body).toBe('Попробуйте ещё раз. Если не получится, проверьте подключение к интернету.')
      expect(body).not.toMatch(/нет (сети|связи|подключения)/i)
    }
    expect(safetyFailure(en, new TypeError('Network request failed'), 'catalogue').body).toBe(en.safety.failedBody)
  })

  it('says «try again» next to «Повторить» when the server failed, not «что-то пошло не так»', () => {
    for (const code of ['internal_error', 'dependency_unavailable', 'bad_request', 'conflict', 'not_found']) {
      const { body } = safetyFailure(ru, new ApiError(code, 500, 'boom'), 'answer')
      expect(body, code).toBe(ru.safety.failedBody)
    }
    expect(safetyFailure(ru, new ApiTimeoutError('/safety/ask', 30_000), 'answer').body).toBe(ru.safety.failedBody)
    expect(safetyFailure(en, new ApiError('internal_error', 500, 'boom'), 'catalogue').body).toBe(en.safety.failedBody)
  })

  it('keeps the server text only when it asks for something other than a retry', () => {
    expect(safetyFailure(ru, new ApiError('unauthorized', 401, 'no'), 'answer').body).toBe(ru.errors.unauthorized)
    expect(safetyFailure(ru, new ApiError('reauth_required', 401, 'no'), 'answer').body).toBe(ru.errors.reauthRequired)
    expect(safetyFailure(ru, new ApiError('consent_required', 403, 'no'), 'catalogue').body).toBe(ru.errors.consentRequired)
    expect(safetyFailure(ru, new ApiError('rate_limited', 429, 'no'), 'catalogue').body).toBe(ru.errors.rateLimited)
  })
})

describe('the AI question and «Повторить»', () => {
  it('sends the same words for the same pet again, so a retry loses neither', () => {
    const first = askRequest('киви', '2b7c2f0e-8a4d-4f3c-9d1e-1a2b3c4d5e6f', 'dog')
    expect(first).toEqual({ query: 'киви', pet_id: '2b7c2f0e-8a4d-4f3c-9d1e-1a2b3c4d5e6f' })
    expect(askRequest('киви', '2b7c2f0e-8a4d-4f3c-9d1e-1a2b3c4d5e6f', 'dog')).toEqual(first)
  })

  it('asks for the species when no saved pet is chosen', () => {
    expect(askRequest('киви', null, 'cat')).toEqual({ query: 'киви', species: 'cat' })
  })
})
