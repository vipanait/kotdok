import { StatusBar } from 'expo-status-bar'
import { StyleSheet, Text, View } from 'react-native'
import { API_VERSION } from '@lapka/contracts'
import { SUPPORTED_LOCALES, createApiClient } from '@lapka/shared'

// The client the screens will use from stage 4 onward. Built here already so
// the mobile bundle proves the shared transport compiles for React Native.
const api = createApiClient({ baseUrl: 'https://lapka.my' })

// Placeholder screen: it only proves the app builds and that both workspace
// packages resolve. Real screens start at stage 4.
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Лапка</Text>
      <Text style={styles.line}>API {API_VERSION}</Text>
      <Text style={styles.line}>{SUPPORTED_LOCALES.join(' / ')}</Text>
      <Text style={styles.line}>{Object.keys(api).length} endpoints</Text>
      <StatusBar style="auto" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 28, fontWeight: '600' },
  line: { fontSize: 16 },
})
