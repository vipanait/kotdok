import Link from 'next/link'
import { notFound } from 'next/navigation'
import { UuidSchema, type SymptomCheckRecord } from '@lapka/contracts'
import Icon from '@/components/ui/Icon'
import CabinetShell from '@/components/cabinet/CabinetShell'
import HistoryRows from '@/components/cabinet/HistoryRows'
import Illustration from '@/components/ui/Illustration'
import { formatMonthHeading, monthKey } from '@/features/symptom-check/check-options'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import { loadCheckHistory, loadCheckPets } from '@/server/checks/load-check-pages'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { getTimeZone } from '@/server/i18n/get-time-zone'
import { formatCount } from '@/shared/i18n/plural'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.history.title)

/** Newest first in, newest month first out, rows keeping their order. */
function groupByMonth(checks: SymptomCheckRecord[], timeZone: string) {
  const groups: { key: string; first: string; checks: SymptomCheckRecord[] }[] = []
  for (const check of checks) {
    const key = monthKey(check.created_at, timeZone)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.checks.push(check)
    else groups.push({ key, first: check.created_at, checks: [check] })
  }
  return groups
}

/**
 * The check history (web v1 «history»); with `?pet=` the history of one pet
 * (web v1 «pet-history»), reached from its medical record. The pet must be
 * the caller's own and live — anything else is a 404.
 */
export default async function ChecksPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const rawPet = (await searchParams).pet
  const petId = typeof rawPet === 'string' ? rawPet : null
  const cabinet = await requireCabinet(`/login?next=${encodeURIComponent(petId ? `/checks?pet=${petId}` : '/checks')}`)
  if (petId !== null && !UuidSchema.safeParse(petId).success) notFound()

  const [checks, pets, locale, timeZone] = await Promise.all([
    loadCheckHistory(cabinet.user.id, petId),
    petId ? loadCheckPets(cabinet.user.id) : Promise.resolve([]),
    getLocale(),
    getTimeZone(),
  ])
  const pet = petId ? pets.find(entry => entry.id === petId) ?? null : null
  if (petId && !pet) notFound()
  const dict = await getDictionary(locale)
  const t = dict.history

  return (
    <CabinetShell cabinet={cabinet} active="history" crumb={t.crumb}>
      <div className="pagehead">
        <div>
          <h1>{t.title}</h1>
          <p>{pet ? t.petSubtitle.replace('{name}', pet.name) : t.subtitle}</p>
        </div>
        {pet ? (
          <Link href={`/pets/${pet.id}`} className="link">
            <Icon name="back" />
            {t.petBack}
          </Link>
        ) : (
          <Link href="/check" className="btn primary">{t.newCheck}</Link>
        )}
      </div>

      <section className="card">
        {checks.length === 0 ? (
          <div className="empty">
            <Illustration name="welcome-pets" size={210} />
            <h2>{t.emptyTitle}</h2>
            <p>{t.emptyText}</p>
            <Link href={pet ? `/check?pet=${pet.id}` : '/check'} className="btn primary">{t.emptyAction}</Link>
          </div>
        ) : (
          groupByMonth(checks, timeZone).map(group => (
            <section key={group.key} className="history-month" aria-labelledby={`month-${group.key}`}>
              <div className="section-head">
                <h2 id={`month-${group.key}`}>{formatMonthHeading(group.first, locale, timeZone)}</h2>
                <span className="small muted">{formatCount(t.count, group.checks.length, locale)}</span>
              </div>
              <HistoryRows checks={group.checks} dict={dict} locale={locale} timeZone={timeZone} />
            </section>
          ))
        )}
      </section>
    </CabinetShell>
  )
}
