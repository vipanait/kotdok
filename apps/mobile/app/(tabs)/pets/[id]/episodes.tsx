import { router, useLocalSearchParams } from 'expo-router'
import { useText } from '@/i18n'
import { AllPastEpisodes } from '@/features/followup/PastEpisodes'
import { Screen } from '@/ui/Screen'

/** «Все случаи»: every closed case of a pet the owner kept in the record. */
export default function EpisodesScreen() {
  const t = useText()
  const { id } = useLocalSearchParams<{ id: string }>()
  return (
    <Screen title={t.followup.episodesTitle} onBack={() => router.back()} scroll>
      <AllPastEpisodes petId={id} />
    </Screen>
  )
}
