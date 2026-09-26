'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { courseEditable, localToday } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import { RecordProblem } from '../MedicalRecordScreen'
import { medicalRecordHref } from '../stage'
import { useMedicalRecord } from '../use-medical-record'
import CourseForm from './CourseForm'

/** `/pets/[id]/health/new?type=medication`: new courses, one empty to start with. */
export function NewCourseScreen({ petId, petName }: { petId: string; petName: string }) {
  const [today] = useState(() => localToday())
  return <CourseForm petId={petId} petName={petName} course={null} today={today} />
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
  const { state, reload } = useMedicalRecord(petId)
  const [today] = useState(() => localToday())

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton label={dict.medicalRecord.states.loading} />} />
  }

  const course = state.data.overview.medications.find((entry) => entry.id === courseId)
  if (!course) return <CourseGone petId={petId} />
  if (!courseEditable(course, today)) return <CourseFinished petId={petId} courseId={course.id} />
  // Keyed by the course: the fields start from its values once; a refresh underneath does not reset them.
  return <CourseForm key={course.id} petId={petId} petName={petName} course={course} today={today} />
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
