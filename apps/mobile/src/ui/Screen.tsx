import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

/** Plain layout for stage 4. The visual style is transferred in stage 7. */
export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {children}
      </View>
    </SafeAreaView>
  )
}

export function Message({ text, tone = 'error' }: { text: string; tone?: 'error' | 'info' }) {
  return <Text style={tone === 'error' ? styles.error : styles.info}>{text}</Text>
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '600', marginBottom: 8 },
  error: { color: '#b3261e' },
  info: { color: '#444' },
})
