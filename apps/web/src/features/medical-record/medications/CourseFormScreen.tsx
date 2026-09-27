'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import type { Medication } from '@lapka/contracts'
import { courseEditable } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import { useToday } from '@/features/forms/use-today'
import type { Fresh } from '../held-record'
import { RecordProblem } from '../MedicalRecordScreen'
import { medicalRecordHref } from '../stage'
import { DriftNotice, useHeldRecord } from '../use-held-record'
import { useMedicalRecord } from '../use-medical-record'
import CourseForm from './CourseForm'
import { courseDrift } from './course-view'

/**
 * `/pets/[id]/health/new?type=medication`: new courses, one empty to start with.
 * `today`: the owner's day from the page, the same on the server and in the
 * browser; it moves on at midnight (MW-09).
 */
export function NewCourseScreen({ petId, petName, today }: { petId: string; petName: string; today: string }) {
  const day = useToday(today)
  return <CourseForm petId={petId} petName={petName} course={null} today={day} />
}

/** What the latest load says about the course: finished by the owner's day is only read. */
function freshCourse(courses: Medication[], courseId: string, today: string): Fresh<Medication> {
  const course = courses.find((entry) => entry.id === courseId)
  if (!course) return { kind: 'gone' }
  return courseEditable(course, today) ? { kind: 'open', record: course } : { kind: 'closed' }
}

/**
 * `/pets/[id]/health/[courseId]/edit`: a current course's own values, read
 * through the v1 API. A course that is finished by the owner's day — the
 * page's server check knows only that it is not finished everywhere yet —
 * is not opened as a form: a finished course is only read (owner rule of 26
 * September 2026), and the server refuses its change anyway.
 */
export function EditCourseScreen({ petId, petName, courseId }: { petId: string; petName: string; courseId: string }) {
  const dict = useTranslations()
  const { state, reload, today } = useMedicalRecord(petId)
  // The form keeps the course it opened with while the owner types; a refresh
  // underneath — or midnight ending the course — only tells (MW-09).
  const held = useHeldRecord(state.status === 'ready' ? freshCourse(state.data.overview.medications, courseId, today) : null)

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton label={dict.medicalRecord.states.loading} />} />
  }

  const course = held.record
  if (!course) {
    const found = state.data.overview.medications.find((entry) => entry.id === courseId)
    return found ? <CourseFinished petId={petId} courseId={found.id} /> : <CourseGone petId={petId} />
  }
  // Keyed by the course and the load it started from: the fields start from its values once.
  return (
    <CourseForm
      key={`${course.id}-${held.version}`}
      petId={petId}
      petName={petName}
      course={course}
      today={today}
      onDirtyChange={held.setDirty}
      notice={
        <DriftNotice
          drift={courseDrift(held.drift, course, today)}
          onTakeLatest={held.takeLatest}
          sectionHref={medicalRecordHref.section(petId, 'medications')}
          recordHref={medicalRecordHref.recordView(petId, course.id)}
        />
      }
    />
  )
}

function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => ref.current?.focus(), [])
  return ref
}

export function CourseGone({ petId }: { petId: string }) {
  const dict = useTranslations()
  const words = dict.medicalRecord.courseRecord
  const ref = useFocusOnMount<HTMLHeadingElement>()
  return (
    <section className="card health-problem" aria-labelledby="course-gone-title">
      <h1 id="course-gone-title" ref={ref} tabIndex={-1}>{words.notFoundTitle}</h1>
      <p>{words.notFoundBody}</p>
      <Link href={medicalRecordHref.section(petId, 'medications')} className="btn primary">{words.back}</Link>
    </section>
  )
}

function CourseFinished({ petId, courseId }: { petId: string; courseId: string }) {
  const dict = useTranslations()
  const words = dict.medicalRecord.courseRecord
  const ref = useFocusOnMount<HTMLHeadingElement>()
  return (
    <section className="card health-problem" aria-labelledby="course-finished-title">
      <h1 id="course-finished-title" ref={ref} tabIndex={-1}>{words.finishedTitle}</h1>
      <p>{words.finishedFormBody}</p>
      <Link href={medicalRecordHref.recordView(petId, courseId)} className="btn primary">{words.openCourse}</Link>
    </section>
  )
}

function FormSkeleton({ label }: { label: string }) {
  return (
    <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="skeleton-block record-form event-skeleton-form" aria-hidden />
    </div>
  )
}
