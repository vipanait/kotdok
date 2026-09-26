'use client'

import { useEffect, useState } from 'react'
import { cssString, localToday } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import LapkaLogo from '@/components/LapkaLogo'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { RecordProblem, StaleNotice } from '../MedicalRecordScreen'
import { medicalRecordHref } from '../stage'
import WeightChart from '../WeightChart'
import { vetSummaryPage, type SummaryPart, type VetSummaryPage } from './summary-view'
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
  // taken now and the year of visits from it, the page overdue and the footer's date.
  const [today] = useState(() => localToday())
  const { state, reload } = useVetSummary(petId, today)
  const page = state.status === 'ready' ? vetSummaryPage(dict, locale, state.data, today) : null

  useFileTitle(page?.fileTitle ?? null)

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
    <div className="vet-summary">
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

        <PartCard id="vet-vaccinations" title={words.vaccinations} part={page.vaccinations} widths={['28%', '18%', '30%', '24%']} />
        <PartCard id="vet-parasites" title={words.parasites} part={page.parasites} widths={['22%', '22%', '30%', '26%']} />
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

/** A table on a wide screen and on paper; on a phone each row is a record with its labels (web v1 «summary» 390). */
function PartCard({ id, title, part, widths }: { id: string; title: string; part: SummaryPart; widths: string[] }) {
  return (
    <section className={`card vet-card${part.kind === 'note' ? ' vet-keep' : ''}`} aria-labelledby={`${id}-title`}>
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
            {part.table.rows.map((row) => (
              <tr key={row.key}>
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
              {/* The level in words: black-and-white paper keeps it (spec 7.18). */}
              <UrgencyBadge urgency={check.urgency} dict={dict} />
              <strong>{check.day}</strong>
              <span>{check.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The printed page (spec 7.18): A4, and in its bottom margin the footer and
 * «Страница N из M» on every page. The text holds the owner's day and the
 * site's words, so the rule is written here, only while this page is open;
 * `cssString` keeps it a CSS string whatever it holds. A browser without
 * margin boxes still prints the footer once, at the end of the summary.
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
 * The page is titled by the file name of the spec (7.18), «Мурка — медкарта
 * — 26.09.2026», for as long as the summary is on screen: that is the name
 * «Сохранить как PDF» offers. Set while the page is open, not around the
 * print call — Safari on iOS names its PDF by the title it already knew
 * before `print()`, whatever the page sets in `beforeprint` or just before
 * the call (checked in the iOS Simulator, MW-07 fix round 1). The site's own
 * title comes back when the page closes.
 */
function useFileTitle(fileTitle: string | null) {
  useEffect(() => {
    if (!fileTitle) return
    const pageTitle = document.title
    document.title = fileTitle
    return () => {
      document.title = pageTitle
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
