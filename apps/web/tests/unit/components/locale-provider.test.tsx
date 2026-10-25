import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ru from '@/shared/i18n/dictionaries/ru'
import { LocaleProvider, useTranslations } from '@/components/LocaleProvider'
import { coreOf, sliceOf } from '@/shared/i18n/slices'

function Reads({ what }: { what: 'site' | 'medicalRecord' }) {
  const t = useTranslations()
  return <span>{what === 'site' ? t.site.symptoms : t.medicalRecord.title}</span>
}

describe('LocaleProvider', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('lets a nested provider add a slice over the core', () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="ru" dict={coreOf(ru)}>
        <Reads what="site" />
        <LocaleProvider locale="ru" dict={sliceOf(ru, 'pets/[id]')}>
          <Reads what="medicalRecord" />
        </LocaleProvider>
      </LocaleProvider>,
    )
    expect(html).toContain(ru.site.symptoms)
    expect(html).toContain(ru.medicalRecord.title)
  })

  it('names the namespace a route forgot to provide, outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')
    expect(() =>
      renderToStaticMarkup(
        <LocaleProvider locale="ru" dict={coreOf(ru)}>
          <Reads what="medicalRecord" />
        </LocaleProvider>,
      ),
    ).toThrow(/medicalRecord/)
  })
})
