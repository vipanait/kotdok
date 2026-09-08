import { describe, expect, it } from 'vitest'
import { ApiContractError, ApiError, ApiTimeoutError } from '@lapka/shared'
import { ru } from '@/i18n/ru'
import { AppError, describeFailure, errorMessage } from './errors'

describe('error messages', () => {
  it('translates a Supabase auth code', () => {
    // The message is English on purpose: it must not be what reaches the screen.
    const cause = Object.assign(new Error('Invalid login credentials'), {
      code: 'invalid_credentials',
    })
    expect(errorMessage(ru, cause, 'Не удалось войти')).toBe(ru.errors.invalidCredentials)
  })

  it('translates an API code', () => {
    const cause = new ApiError('insufficient_credits', 402, 'not enough credits')
    expect(errorMessage(ru, cause, 'Не удалось')).toBe(ru.errors.insufficientCredits)
  })

  it('passes through a message the app wrote itself', () => {
    const cause = new AppError(ru.errors.insufficientCredits, 'insufficient_credits')
    expect(errorMessage(ru, cause, 'Не удалось отправить проверку')).toBe(
      ru.errors.insufficientCredits,
    )
  })

  it('says a stalled server is not the same as no connection', () => {
    expect(errorMessage(ru, new ApiTimeoutError('/pets', 30_000), 'Нет связи с сервером')).toBe(
      ru.errors.noAnswer,
    )
  })

  it('falls back rather than showing an untranslated message', () => {
    expect(errorMessage(ru, new Error('Something went wrong'), 'Не удалось войти')).toBe(
      'Не удалось войти',
    )
    expect(errorMessage(ru, new ApiError('bad_request', 400, 'x'), 'Не удалось')).toBe(
      ru.errors.badRequest,
    )
  })

  it('ignores a code that is not a string, and anything that is not an object', () => {
    expect(errorMessage(ru, { code: 42 }, 'Не удалось')).toBe('Не удалось')
    expect(errorMessage(ru, null, 'Не удалось')).toBe('Не удалось')
    expect(errorMessage(ru, 'invalid_credentials', 'Не удалось')).toBe('Не удалось')
  })

  it('does not invent a message for an unknown code', () => {
    const cause = Object.assign(new Error('nope'), { code: 'some_future_code' })
    expect(errorMessage(ru, cause, 'Не удалось войти')).toBe('Не удалось войти')
  })
})

describe('what a failure banner should look like', () => {
  const fallback = 'Не удалось загрузить питомцев'

  it('calls it a lost connection only when nothing came back', () => {
    // What `fetch` throws differs by platform, so the test uses the two shapes
    // React Native has actually been seen to produce.
    expect(describeFailure(ru, new TypeError('Network request failed'), fallback)).toEqual({
      text: fallback,
      offline: true,
    })
    expect(describeFailure(ru, new Error('Network request failed'), fallback)).toEqual({
      text: fallback,
      offline: true,
    })
  })

  it('does not blame the network for anything the server said', () => {
    const answered = [
      new ApiError('internal_error', 500, 'x'),
      new ApiTimeoutError('/pets', 30_000),
      new ApiContractError('/pets', []),
      new AppError('Анализ не удался', 'analysis_failed'),
      Object.assign(new Error('Invalid login credentials'), { code: 'invalid_credentials' }),
    ]

    for (const cause of answered) {
      expect(describeFailure(ru, cause, fallback).offline).toBe(false)
    }
  })

  it('says the server fell over, rather than showing the fallback', () => {
    expect(describeFailure(ru, new ApiError('internal_error', 500, 'x'), fallback).text).toBe(
      ru.errors.internal,
    )
  })
})
