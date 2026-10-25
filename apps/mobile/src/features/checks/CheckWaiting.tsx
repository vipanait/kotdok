import { ActivityIndicator, Image, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useText } from '@/i18n'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'
import { recoveryFor } from './check-job'
import type { CheckFailure } from './use-check-submission'

/**
 * The minute the analysis takes.
 *
 * When it goes wrong the way out depends on why: an empty balance needs a
 * request, a slow answer will arrive in the history on its own, and anything
 * else is worth trying again. Offering all three would make the person choose
 * between explanations they do not have.
 */
export function CheckWaiting({ failure, onRetry }: { failure: CheckFailure | null; onRetry: () => void }) {
  const t = useText()
  const way = recoveryFor(failure?.kind ?? null)
  const recovery =
    way === 'request'
      ? { title: t.check.requestCheck, onPress: () => router.push('/check/extra-check') }
      : way === 'history'
        ? { title: t.check.openHistory, onPress: () => router.push('/check/history') }
        : { title: t.check.tryAgain, onPress: onRetry }

  return (
    <Screen
      centered
      dock={
        failure ? (
          <>
            <Button title={recovery.title} onPress={recovery.onPress} />
            <LinkButton title={t.common.toPets} onPress={() => router.replace('/pets')} />
          </>
        ) : null
      }
    >
      <Text variant="h1" center style={styles.waitingTitle}>
        {t.check.waitingTitle}
      </Text>
      <Image
        source={require('../../../assets/art/pets-together.png')}
        style={styles.waitingArt}
        resizeMode="contain"
        accessible={false}
      />
      {/* The spinner stops once there is nothing left to wait for. */}
      {failure ? null : <ActivityIndicator color={colour.accent} style={styles.spinner} />}
      {failure ? (
        <Banner text={failure.text} tone="error" />
      ) : (
        <Banner text={t.check.waitingBody} />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  waitingTitle: { marginBottom: 24 },
  waitingArt: { width: 216, height: 216, alignSelf: 'center', marginBottom: space.section },
  spinner: { marginBottom: 24 },
})
