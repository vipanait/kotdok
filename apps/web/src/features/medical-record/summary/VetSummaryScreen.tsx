'use client'

import { useEffect } from 'react'
import { cssString } from '@lapka/shared'
import { useToday } from '@/features/forms/use-today'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import LapkaLogo from '@/components/LapkaLogo'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { RecordProblem, StaleNotice } from '../MedicalRecordScreen'
import { medicalRecordHref } from '../stage'
import WeightChart from '../WeightChart'
import { vetSummaryPage, type SummaryPart, type VetSummaryPage } from './summary-view'
import { usePrintsPageMargins } from './page-margins'
import { useVetSummary } from './use-vet-summary'

/**
 * `/pets/[id]/vet-summary`: «Для врача», read through the v1 API. The same
 * page is what prints — «Распечатать» and «Сохранить PDF» both open the
 * browser's print dialog, and the print style (medical-record.css, MW-07)
 * takes the site's frame, the buttons and the shadows away and lays the
 * summary out on A4. The page is titled by the file name of the spec
 * (7.18), so «Сохранить как PDF» offers «Мурка — медкарта — …».
 */
export default function VetSummaryScreen({ petId }: { petId: string }) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.medicalRecord.vetSummary
  // The owner's day, from the browser's clock: the server counts the courses
  // taken now and the year of visits from it, the page overdue and the footer's
  // date. It moves on at midnight, and the summary is read again for it (MW-09).
  const today = useToday()
  const { state, reload } = useVetSummary(petId, today)
  const page = state.status === 'ready' ? vetSummaryPage(dict, locale, state.data, today) : null

  useFileTitle(page?.fileTitle ?? null)
  // Where the page margins carry the footer, the closing copy is not printed as well (MW-09).
  const pageMargins = usePrintsPageMargins()

  if (state.status !== 'ready' || !page) {
    return (
      <RecordProblem
        state={state as Exclude<typeof state, { status: 'ready' }>}
        petId={petId}
        reload={reload}
        returnTo={medicalRecordHref.vetSummary(petId)}
        loading={<SummarySkeleton title={words.title} label={words.loading} />}
      />
    )
  }

  return (
    <div className="vet-summary" data-page-margins={pageMargins ? '' : undefined}>
      <header className="pagehead vet-summary-head">
        <div>
          <h1>{page.title}</h1>
          <p>{page.subtitle}</p>
        </div>
        <div className="vet-summary-actions" role="group" aria-label={words.actionsLabel}>
          <button type="button" className="btn secondary" onClick={() => window.print()}>
            {words.print}
          </button>
          <button type="button" className="btn primary" aria-describedby="vet-summary-pdf-hint" onClick={() => window.print()}>
            {words.savePdf}
          </button>
          <p id="vet-summary-pdf-hint" className="vet-summary-hint">{words.pdfHint}</p>
        </div>
      </header>

      <StaleNotice state={state} reload={reload} />

      <div className="vet-summary-body">
        {/* On paper the page starts with the logo and «Медкарта: Мурка» (spec 7.18). */}
        <div className="vet-print-head">
          <LapkaLogo width={96} height={36} className="vet-print-logo" />
          <p className="vet-print-title">{page.printTitle}</p>
        </div>

        <section className="card vet-card vet-pet" aria-labelledby="vet-pet-name">
          <h2 id="vet-pet-name">{page.pet.name}</h2>
          <p>{page.pet.meta}</p>
          <p>{page.pet.weight}</p>
        </section>

        <section className="card vet-card vet-keep" aria-labelledby="vet-important-title">
          <h2 id="vet-important-title">{words.important}</h2>
          {page.important.kind === 'note' ? (
            <p className="vet-note">{page.important.text}</p>
          ) : (
            <dl className="vet-facts">
              {page.important.facts.map((fact, index) => (
                <div key={fact.label} className={`vet-fact vet-fact-${index}`}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.text}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <PartCard id="vet-vaccinations" title={words.vaccinations} part={page.vaccinations} widths={['28%', '18%', '30%', '24%']} short />
        <PartCard id="vet-parasites" title={words.parasites} part={page.parasites} widths={['22%', '22%', '30%', '26%']} short />
        <PartCard id="vet-visits" title={words.visits} part={page.visits} widths={['24%', '34%', '42%']} />

        <section className="card vet-card vet-keep vet-weight" aria-labelledby="vet-weight-title">
          <h2 id="vet-weight-title">{words.weight}</h2>
          {page.weight.kind === 'note' ? (
            <p className="vet-note">{page.weight.text}</p>
          ) : (
            <>
              {page.weight.chart && <WeightChart points={page.weight.chart} label={page.weight.chartLabel} className="vet-weight-chart" />}
              <p className="vet-weight-latest">{page.weight.latest}</p>
              {page.weight.earlier && <p className="vet-weight-earlier">{page.weight.earlier}</p>}
            </>
          )}
        </section>

        <ChecksCard page={page} dict={dict} />

        <p className="vet-summary-footer">{page.footer}</p>
      </div>

      <PageFooter footer={page.footer} dict={dict} />
    </div>
  )
}

/**
 * A table on a wide screen and on paper; on a phone each row is a record with
 * its labels (web v1 «summary» 390). A `short` table has a row a disease or a
 * group — a few lines, never a page: Safari prints it whole, as a table; the
 * visits run on for pages and print there as records (medical-record.css).
 */
function PartCard({ id, title, part, widths, short = false }: { id: string; title: string; part: SummaryPart; widths: string[]; short?: boolean }) {
  const kind = part.kind === 'note' ? ' vet-keep' : short ? ' vet-card-short' : ' vet-card-long'
  return (
    <section className={`card vet-card${kind}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {part.kind === 'note' ? (
        <p className="vet-note">{part.text}</p>
      ) : (
        <table className="vet-table">
          <colgroup>
            {part.table.columns.map((column, index) => (
              <col key={column} style={{ width: widths[index] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {part.table.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/*
              The first row of a long table also carries the section's name:
              Safari prints those rows as records and ignores «keep the heading
              with what follows», so there the name is printed inside the first
              record (MW-09).
            */}
            {part.table.rows.map((row, index) => (
              <tr key={row.key} data-heading={index === 0 && !short ? title : undefined}>
                {row.cells.map((cell, index) => (
                  <td key={index} data-label={cell.label}>
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function ChecksCard({ page, dict }: { page: VetSummaryPage; dict: Dictionary }) {
  const words = dict.medicalRecord.vetSummary
  return (
    <section className="card vet-card vet-keep" aria-labelledby="vet-checks-title">
      <h2 id="vet-checks-title">{words.checks}</h2>
      {'note' in page.checks ? (
        <p className="vet-note">{page.checks.note}</p>
      ) : (
        <ul className="vet-checks">
          {page.checks.map((check) => (
            <li key={check.key} className="vet-check">
              {/*
                The badge shows first on screen; on paper the check is one line,
                «2 августа 2026 · Наблюдаем · Рвота…» (spec 7.17, web v1 «print»).
                The level in words: black-and-white paper keeps it (spec 7.18).
              */}
              <strong className="vet-check-day">{check.day}</strong>
              <UrgencyBadge urgency={check.urgency} dict={dict} className="vet-check-level" />
              <span className="vet-check-text">
                <Words text={check.text} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The check's text word by word. On paper the check is cut to one line with
 * «…», and the browser may cut a run of text mid-word to make room for it
 * (Safari on iOS printed «аппети…», MW-09) — but never inside a box that
 * stays whole. So in print each word is one (medical-record.css), and the
 * line ends on a whole word. On screen the words are plain text.
 */
function Words({ text }: { text: string }) {
  return text.split(/(\s+)/).map((part, index) =>
    index % 2 === 1 ? part : part && <span key={index} className="vet-check-word">{part}</span>,
  )
}

/**
 * The printed page (spec 7.18): A4, and in its bottom margin the footer and
 * «Страница N из M» on every page. The text holds the owner's day and the
 * site's words, so the rule is written here, only while this page is open;
 * `cssString` keeps it a CSS string whatever it holds. A browser without
 * margin boxes still prints the footer once, at the end of the summary; one
 * with them (`usePrintsPageMargins`) prints only these.
 */
function PageFooter({ footer, dict }: { footer: string; dict: Dictionary }) {
  const words = dict.medicalRecord.vetSummary
  const box = "font: 8pt/1.35 system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #444; vertical-align: top; padding-top: 3mm;"
  const css = `@page {
  size: A4;
  margin: 14mm 14mm 20mm;
  @bottom-left { content: ${cssString(footer)}; ${box} }
  @bottom-right { content: ${cssString(words.page)} " " counter(page) " " ${cssString(words.pageOf)} " " counter(pages); ${box} white-space: nowrap; }
}`
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}

/**
 * The page is titled by the file name (spec 7.18), «Мурка — медкарта —
 * 26.09.2026», for as long as the summary is on screen: that is the name
 * «Сохранить как PDF» offers. Set while the page is open, not around the
 * print call — Safari on iOS names its PDF by the title it already knew
 * before `print()`, whatever the page sets in `beforeprint` or just before
 * the call (checked in the iOS Simulator, MW-07 fix round 1). The site's own
 * title comes back when the page closes — only while the file name is still
 * the title: by the time this cleanup runs, the next page may already have
 * set its own, and that one stays.
 */
export function useFileTitle(fileTitle: string | null) {
  useEffect(() => {
    if (!fileTitle) return
    const pageTitle = document.title
    document.title = fileTitle
    return () => {
      if (document.title === fileTitle) document.title = pageTitle
    }
  }, [fileTitle])
}

function SummarySkeleton({ title, label }: { title: string; label: string }) {
  return (
    <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="pagehead" aria-hidden>
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="vet-summary-body" aria-hidden>
        <div className="skeleton-block vet-skeleton-pet" />
        <div className="skeleton-block vet-skeleton-part" />
      </div>
    </div>
  )
}
