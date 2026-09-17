import { useLocalSearchParams } from 'expo-router'
import { CheckResult } from '@/features/checks/CheckResult'

export default function CheckResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <CheckResult id={id} />
}
