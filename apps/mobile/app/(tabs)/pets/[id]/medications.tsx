import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { HealthOverview, Medication } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { courseDates, splitCourses } from '@/features/medical-record/medications'
import { Button } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { Icon } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/** Medication courses (M18): now and before. A course from the form asks for its details. */
export default function Medications() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const words = t.medicalRecord.meds
  const [overview, setOverview] = useState<HealthOverview | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setOverview(await withFreshSession((api) => api.getHealthOverview(id)))
    } catch (cause) {
      setError(describeFailure(t, cause, t.errors.loadHealthFailed))
    }
  }, [id, t])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const shown = overview?.pet.id === id ? overview : null
  const today = localToday()
  const { current, past } = splitCourses(shown?.medications ?? [], today)
  const add = () => router.push(`/pets/${id}/medication-form`)

  function CourseCard({ course }: { course: Medication }) {
    const dates = courseDates(t, course, today)
    return (
      <Card
        outlined
        onPress={() => router.push(`/pets/${id}/medication/${course.id}`)}
        accessibilityLabel={[course.name, course.dosage, dates].filter(Boolean).join(', ')}
        style={styles.card}
      >
        <Text variant="h3">{course.name}</Text>
        {course.dosage ? <Text tone="muted">{course.dosage}</Text> : null}
        <Text variant="label" tone="faint">
          {dates}
        </Text>
      </Card>
    )
  }

  return (
    <Screen
      title={words.title}
      onBack={() => router.back()}
      action={shown ? { icon: 'plus', label: words.add, onPress: add } : undefined}
      scroll
    >
      {error ? (
        <>
          <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
          <Button title={t.common.retry} kind="secondary" onPress={() => void load()} />
          <View style={styles.gap} />
        </>
      ) : null}

      {shown && current.length + past.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="med" size={56} color={colour.line} />
          <Text variant="h2" center>
            {words.emptyTitle}
          </Text>
          <Text tone="muted" center>
            {words.emptyBody}
          </Text>
          <Button title={words.add} onPress={add} />
        </View>
      ) : null}

      {current.length > 0 ? (
        <>
          <Text variant="h2" style={styles.group}>
            {words.current}
          </Text>
          {current.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </>
      ) : null}

      {past.length > 0 ? (
        <>
          <Text variant="h2" style={styles.group}>
            {words.past}
          </Text>
          {past.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { height: space.block },
  empty: { alignItems: 'center', gap: space.row, marginTop: space.section },
  group: { marginBottom: space.row },
  card: { gap: 4, padding: 16 },
})
