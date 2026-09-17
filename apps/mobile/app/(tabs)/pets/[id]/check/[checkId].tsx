import { useLocalSearchParams } from 'expo-router'
import { CheckResult } from '@/features/checks/CheckResult'

export default function CheckResultScreen() {
  const { checkId } = useLocalSearchParams<{ checkId: string }>()
  return <CheckResult id={checkId} />
}
