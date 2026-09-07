import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

/**
 * Plain layout for stage 4. The visual style is transferred in stage 7.
 *
 * `scroll` is for the screens that outgrew a phone: a form does not centre, it
 * starts at the top and moves out from under the keyboard.
 */
export function Screen({
  title,
  children,
  scroll = false,
}: {
  title: string
  children: ReactNode
  scroll?: boolean
}) {
  if (!scroll) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
          {children}
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.title}>{title}</Text>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function Message({ text, tone = 'error' }: { text: string; tone?: 'error' | 'info' }) {
  return <Text style={tone === 'error' ? styles.error : styles.info}>{text}</Text>
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  scrollBody: { padding: 24, gap: 16, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: '600', marginBottom: 8 },
  error: { color: '#b3261e' },
  info: { color: '#444' },
})
