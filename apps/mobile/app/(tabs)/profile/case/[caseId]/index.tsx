import { useLocalSearchParams } from 'expo-router'
import { CaseTimeline } from '@/features/followup/CaseTimeline'

export default function CaseTimelineScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>()
  return <CaseTimeline caseId={caseId} />
}
