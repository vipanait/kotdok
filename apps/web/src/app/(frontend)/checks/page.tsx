import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { UuidSchema } from '@lapka/contracts'
import type { CabinetUser } from '@/server/cabinet/load-cabinet'
import Icon from '@/components/ui/Icon'
import CabinetShell from '@/components/cabinet/CabinetShell'
import CabinetSkeleton from '@/components/cabinet/CabinetSkeleton'
import { HistoryRow, historyWhen } from '@/components/cabinet/HistoryRows'
import CaseHistoryRow from '@/features/followup/CaseHistoryRow'
import { entryChecks, groupHistory, type HistoryEntry } from '@/features/followup/followup-view'
import { loadHistoryCases } from '@/server/checks/load-followup-pages'
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

/** When a history row happened: a check's own time, a case's newest check. */
function entryAt(entry: HistoryEntry): string {
  return entry.kind === 'check' ? entry.check.created_at : entry.checks[0]!.created_at
}

/**
 * Newest first in, newest month first out, rows keeping their order. A case
 * is one row (FU-07), in the month of its newest check.
 */
function groupByMonth(entries: HistoryEntry[], timeZone: string) {
  const groups: { key: string; first: string; entries: HistoryEntry[] }[] = []
  for (const entry of entries) {
    const at = entryAt(entry)
    const key = monthKey(at, timeZone)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.entries.push(entry)
    else groups.push({ key, first: at, entries: [entry] })
  }
  return groups
}

/**
 * The check history (web v1 «history»); with `?pet=` the history of one pet
 * (web v1 «pet-history»), reached from its medical record. The pet must be
 * the caller's own and live — anything else is a 404, and an HTTP 404
 * (MW-09): the pet is checked here, before anything streams, and only the
 * history below waits behind the skeleton (no loading.tsx above this page —
 * it would commit the response to 200 before the check, see Next's
 * streaming guide, «The HTTP contract»).
 */
export default async function ChecksPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const rawPet = (await searchParams).pet
  const petId = typeof rawPet === 'string' ? rawPet : null
  const cabinet = await requireCabinet(`/login?next=${encodeURIComponent(petId ? `/checks?pet=${petId}` : '/checks')}`)
  if (petId !== null && !UuidSchema.safeParse(petId).success) notFound()

  const pet = petId ? (await loadCheckPets(cabinet.user.id)).find(entry => entry.id === petId) ?? null : null
  if (petId && !pet) notFound()

  return (
    <Suspense fallback={<CabinetSkeleton />}>
      <ChecksHistory cabinet={cabinet} pet={pet} />
    </Suspense>
  )
}

async function ChecksHistory({ cabinet, pet }: { cabinet: CabinetUser; pet: { id: string; name: string } | null }) {
  const [checks, locale, timeZone] = await Promise.all([
    loadCheckHistory(cabinet.user.id, pet?.id ?? null),
    getLocale(),
    getTimeZone(),
  ])
  const dict = await getDictionary(locale)
  const t = dict.history
  // The checks of a follow-up case are one row; a check in no case stays as it was.
  const cases = await loadHistoryCases(cabinet.user.id, checks)
  const entries = groupHistory(checks, cases.links)
  const formatWhen = historyWhen(locale, timeZone)

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
          groupByMonth(entries, timeZone).map(group => (
            <section key={group.key} className="history-month" aria-labelledby={`month-${group.key}`}>
              <div className="section-head">
                <h2 id={`month-${group.key}`}>{formatMonthHeading(group.first, locale, timeZone)}</h2>
                <span className="small muted">{formatCount(t.count, entryChecks(group.entries), locale)}</span>
              </div>
              <div>
                {group.entries.map(entry =>
                  entry.kind === 'check' ? (
                    <HistoryRow key={entry.check.id} check={entry.check} dict={dict} formatWhen={formatWhen} />
                  ) : (
                    <CaseHistoryRow
                      key={entry.caseId}
                      caseId={entry.caseId}
                      link={entry.link}
                      checks={entry.checks}
                      checkins={cases.checkins.get(entry.caseId) ?? 0}
                      dict={dict}
                      locale={locale}
                      timeZone={timeZone}
                    />
                  ),
                )}
              </div>
            </section>
          ))
        )}
      </section>
    </CabinetShell>
  )
}
