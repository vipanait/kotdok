import { describe, expect, it } from 'vitest'
import { ApiError, ApiTimeoutError } from '@lapka/shared'
import { AppError, errorMessage } from './errors'

describe('error messages', () => {
  it('translates a Supabase auth code', () => {
    // The message is English on purpose: it must not be what reaches the screen.
    const cause = Object.assign(new Error('Invalid login credentials'), {
      code: 'invalid_credentials',
    })
    expect(errorMessage(cause, 'Не удалось войти')).toBe('Неверная почта или пароль')
  })

  it('translates an API code', () => {
    const cause = new ApiError('insufficient_credits', 402, 'not enough credits')
    expect(errorMessage(cause, 'Не удалось')).toBe('Не хватает проверок на балансе')
  })

  it('passes through a message the app wrote itself', () => {
    const cause = new AppError('Не хватает проверок на балансе', 'insufficient_credits')
    expect(errorMessage(cause, 'Не удалось отправить проверку')).toBe(
      'Не хватает проверок на балансе',
    )
  })

  it('says a stalled server is not the same as no connection', () => {
    expect(errorMessage(new ApiTimeoutError('/pets', 30_000), 'Нет связи с сервером')).toBe(
      'Сервер не ответил. Попробуйте ещё раз',
    )
  })

  it('falls back rather than showing an untranslated message', () => {
    expect(errorMessage(new Error('Something went wrong'), 'Не удалось войти')).toBe(
      'Не удалось войти',
    )
    expect(errorMessage(new ApiError('bad_request', 400, 'x'), 'Не удалось')).toBe(
      'Проверьте заполненные поля',
    )
  })

  it('ignores a code that is not a string, and anything that is not an object', () => {
    expect(errorMessage({ code: 42 }, 'Не удалось')).toBe('Не удалось')
    expect(errorMessage(null, 'Не удалось')).toBe('Не удалось')
    expect(errorMessage('invalid_credentials', 'Не удалось')).toBe('Не удалось')
  })

  it('does not invent a message for an unknown code', () => {
    const cause = Object.assign(new Error('nope'), { code: 'some_future_code' })
    expect(errorMessage(cause, 'Не удалось войти')).toBe('Не удалось войти')
  })
})
