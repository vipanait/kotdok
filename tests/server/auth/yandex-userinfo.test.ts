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
})
