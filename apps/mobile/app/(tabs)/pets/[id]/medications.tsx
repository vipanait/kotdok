import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import type { Medication } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { splitCourses } from '@lapka/shared'
import { courseDates } from '@/features/medical-record/medications'
import { Button } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { Icon } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { ListSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/** Medication courses (M18): now and before. A course from the form asks for its details. */
export default function Medications() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const words = t.medicalRecord.meds

  // The pet's record through the cache, shared by every screen of this pet:
  // the last one at once, a fresh one each time the screen comes into view.
  const record = useCached(['overview', id], () => withFreshSession((api) => api.getHealthOverview(id, localToday())))
  const overview = record.data
  const error = record.error ? describeFailure(t, record.error, t.errors.loadHealthFailed) : null
  const load = record.reload

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
      ) : !shown ? (
        <ListSkeleton rows={3} />
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
