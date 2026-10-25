import { useLocalSearchParams } from 'expo-router'
import { Checkin } from '@/features/followup/Checkin'

export default function CheckinScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>()
  return <Checkin caseId={caseId} />
}
