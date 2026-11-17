import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import DocumentsStatesPreview from './DocumentsStatesPreview'
import { PREVIEW_STATES, type PreviewState } from './fixtures'
import { uiFixturesEnabled } from './gate'

export const metadata = { title: 'Документы: состояния (тестовые данные)' }

/**
 * `/dev/documents-states` — the recognition screens (DOC-2) drawn with
 * deterministic TEST DATA, inside the real cabinet frame and bottom
 * navigation, for checking them by eye before the server exists. A 404
 * unless the server runs with LAPKA_UI_FIXTURES=1 (ruling R1); signed-in
 * only, like every cabinet page. Nothing here writes: the fixtures'
 * «Сохранить», «Распознать» and «Не добавлять» only switch the state shown.
 */
export default async function DocumentsStatesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // Request time, so the env is read on the running server, not at build.
  await connection()
  if (!uiFixturesEnabled()) notFound()
  const cabinet = await requireCabinet('/login?next=/dev/documents-states')
  const dict = await getDictionary(await getLocale())
  const query = await searchParams
  const state = (PREVIEW_STATES as readonly string[]).includes(String(query.state)) ? (query.state as PreviewState) : 'stored'
  const page = typeof query.page === 'string' && /^\d{1,2}$/.test(query.page) ? Number(query.page) : 1
  const from = typeof query.from === 'string' ? query.from : null

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.documents.title} / тестовые данные`}>
      <DocumentsStatesPreview state={state} page={page} from={from} />
    </CabinetShell>
  )
}
