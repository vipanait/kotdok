import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'

/**
 * What a cabinet page shows while its data loads: the frame's outline and
 * grey blocks where the cards will be — never an empty list that could be
 * mistaken for "no pets" or "no checks".
 */
export default async function CabinetSkeleton() {
  const dict = await getDictionary(await getLocale())
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{dict.shell.loading}</span>
      <div className="sidebar" aria-hidden />
      <div className="cabinet" aria-hidden>
        <div className="topbar" />
        <div className="workspace">
          <div className="skeleton-block skeleton-title" />
          <div className="skeleton-block skeleton-line" />
          <div className="grid2 skeleton-grid">
            <div className="skeleton-block skeleton-card" />
            <div className="skeleton-block skeleton-card" />
          </div>
          <div className="skeleton-block skeleton-wide" />
        </div>
      </div>
    </div>
  )
}
