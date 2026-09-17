import { describe, expect, it } from 'vitest'
import { normalizeYandexUserinfo } from '@/server/auth/yandex-userinfo'

describe('normalizeYandexUserinfo', () => {
  it('maps id to sub and default_email to email', () => {
    expect(
      normalizeYandexUserinfo({
        id: '42',
        default_email: 'cat@yandex.ru',
        display_name: 'Murzik',
        login: 'murzik',
      }),
    ).toEqual({
      id: '42',
      sub: '42',
      default_email: 'cat@yandex.ru',
      email: 'cat@yandex.ru',
      email_verified: true,
      display_name: 'Murzik',
      name: 'Murzik',
      login: 'murzik',
    })
  })

  it('falls back to emails[0] when default_email is missing', () => {
    expect(
      normalizeYandexUserinfo({
        id: 7,
        emails: ['alt@yandex.ru'],
      }),
    ).toMatchObject({
      sub: '7',
      email: 'alt@yandex.ru',
    })
  })

  it('vouches for a mailbox on a Yandex domain, which belongs to the Yandex account itself', () => {
    for (const email of [
      'cat@yandex.ru',
      'cat@ya.ru',
      'cat@yandex.com',
      'cat@yandex.by',
      'cat@yandex.kz',
      'cat@yandex.ua',
      'Cat@YANDEX.RU',
    ]) {
      expect(normalizeYandexUserinfo({ id: '1', default_email: email }), email).toMatchObject({
        email,
        email_verified: true,
      })
    }
  })

  it('does not vouch for an address on any other domain, which Yandex never says it checked', () => {
    for (const email of ['cat@gmail.com', 'cat@mail.ru', 'cat@yandex.ru.evil.com', 'cat@sub.yandex.ru', 'yandex.ru@gmail.com']) {
      expect(normalizeYandexUserinfo({ id: '1', default_email: email }), email).toMatchObject({
        email,
        email_verified: false,
      })
    }
  })

  it('never passes on a verification claim of its own from the raw response', () => {
    expect(
      normalizeYandexUserinfo({ id: '1', default_email: 'cat@gmail.com', email_verified: true }),
    ).toMatchObject({ email_verified: false })
  })

  it('says nothing about verification when there is no address at all', () => {
    expect(normalizeYandexUserinfo({ id: '1' })).not.toHaveProperty('email_verified')
  })
})
