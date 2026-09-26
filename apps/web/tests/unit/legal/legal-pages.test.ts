import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The web tests run in node without a DOM, so these read the page sources: the
 * point is what the published texts say and link to, not how they render.
 */
const root = new URL('../../../src/app/(frontend)/legal/', import.meta.url).pathname
const read = (file: string) => readFileSync(root + file, 'utf8')

describe('legal texts', () => {
  it('ties the consent page to the edition the clients send', () => {
    expect(read('personal-data/page.tsx')).toContain('PD_CONSENT_VERSION')
  })

  it('points the agreement to the policy and the consent', () => {
    const agreement = read('page.tsx')
    expect(agreement).toContain('/legal/privacy')
    expect(agreement).toContain('/legal/personal-data')
    // No such processing exists; a purpose the service does not have cannot be
    // consented to.
    expect(agreement).not.toContain('улучшения качества')
    expect(agreement).not.toContain('возвратом средств')
  })

  it('names who processes the data, but no country', () => {
    for (const file of ['privacy/page.tsx', 'personal-data/page.tsx']) {
      const text = read(file)
      for (const recipient of ['Supabase', 'Vercel', 'OpenAI', 'Telegram', 'Expo']) expect(text, file).toContain(recipient)
      expect(text, file).not.toMatch(/США|Япони|Токио|Ирланди|\bUSA\b|Japan/)
    }
  })

  it('lists the cookies the site actually sets', () => {
    const policy = read('privacy/page.tsx')
    for (const cookie of ['NEXT_LOCALE', 'TIME_ZONE_COOKIE', 'CSRF_COOKIE_NAME', 'PROVIDER_CONSENT_COOKIE']) {
      expect(policy).toContain(cookie)
    }
  })

  it('promises only the photo retention the daily sweep delivers', () => {
    // Unattached uploads are removed by a once-a-day cron, so "three hours after
    // upload" is not a promise the code keeps.
    const policy = read('privacy/page.tsx')
    expect(policy).not.toMatch(/три часа после загрузки/)
    expect(policy).toMatch(/сутки|суток/)
  })

  it('lists sex among the Yandex profile fields, as login:info returns it', () => {
    for (const file of ['privacy/page.tsx', 'personal-data/page.tsx']) {
      expect(read(file), file).toMatch(/[^а-яё]пол[^а-яё]/)
    }
  })

  it('words the consent for every place it is given, not only registration', () => {
    expect(read('personal-data/page.tsx')).not.toContain('Регистрируясь в сервисе')
  })

  it('says the medical record goes to OpenAI with the check', () => {
    // analysis-context.ts sends vaccinations, medicines, visits and notes.
    for (const file of ['privacy/page.tsx', 'personal-data/page.tsx']) {
      expect(read(file), file).toMatch(/OpenAI — анализ[^;]*медицинской карты/)
    }
  })
})
