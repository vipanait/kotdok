'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { RecordProblem, StaleNotice } from '../MedicalRecordScreen'
import { medicalRecordHref } from '../routes'
import { useMedicalRecord } from '../use-medical-record'
import { copyText } from './copy-text'
import { memoText, sitterMemo } from './sitter-memo'

/**
 * «Памятка для передержки» (FB-3/02, design `memo`): the memo as the page
 * shows it, and «Скопировать текст». The site says «скопировано» only once
 * the clipboard took it; where the browser refuses, the plain text is shown
 * selected, to copy by hand. Nothing is sent anywhere and no public link is
 * made: the page is the owner's, behind the pet's own gate. «Для врача»
 * and its PDF stay as they are — this is not a replacement for them.
 */
export default function SitterMemoScreen({ petId }: { petId: string }) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.medicalRecord.memo
  const { state, reload, today } = useMedicalRecord(petId)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const manual = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (copy !== 'failed' || !manual.current) return
    manual.current.focus()
    manual.current.select()
  }, [copy])

  if (state.status !== 'ready') {
    return (
      <RecordProblem
        state={state}
        petId={petId}
        reload={reload}
        loading={
          <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{dict.medicalRecord.states.loading}</span>
          </div>
        }
      />
    )
  }

  const memo = sitterMemo(dict, locale, state.data.overview, today)
  const text = memoText(dict, memo)

  return (
    <div className="health-page memo-page">
      <div className="pagehead">
        <div>
          <h1>{words.title}</h1>
          <p>{words.subtitle.replace('{name}', () => memo.name)}</p>
        </div>
        <Link href={medicalRecordHref.record(petId)} className="link">
          <Icon name="back" />
          {words.back}
        </Link>
      </div>

      <StaleNotice state={state} reload={reload} />

      <div className="care-columns memo-columns">
        <div>
          <article className="card memo-card" aria-labelledby="memo-name">
            <h2 id="memo-name">{memo.name}</h2>
            {memo.meta && <p className="muted">{memo.meta}</p>}
            <div className="divider" />
            {memo.sections.length === 0 ? (
              <p className="muted">{words.empty}</p>
            ) : (
              memo.sections.map((section) => (
                <section key={section.key} aria-labelledby={`memo-${section.key}`}>
                  <h3 id={`memo-${section.key}`}>{section.title}</h3>
                  {section.lines.map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                </section>
              ))
            )}
          </article>
        </div>

        <aside>
          <section className="card soft memo-share" aria-labelledby="memo-share-title">
            <h2 id="memo-share-title">{words.shareTitle}</h2>
            <p>{words.shareBody}</p>
            <button
              type="button"
              className="btn primary"
              onClick={async () => setCopy(await copyText(typeof navigator === 'undefined' ? undefined : navigator.clipboard, text))}
            >
              <Icon name="copy" />
              {words.copy}
            </button>
            <p className={`memo-copy-status ${copy}`} role="status" aria-live="polite">
              {copy === 'copied' ? words.copied : copy === 'failed' ? words.copyFailed : ''}
            </p>
            {copy === 'failed' && (
              <label className="field">
                <span className="field-label">{words.manualLabel}</span>
                <textarea ref={manual} className="input memo-manual" readOnly value={text} rows={10} />
              </label>
            )}
            <div className="divider" />
            <small className="muted">{words.shareNote}</small>
          </section>
        </aside>
      </div>
    </div>
  )
}
