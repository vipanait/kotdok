import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import type { Pet } from '@lapka/contracts'
import { useText } from '@/i18n'
import { LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Field, Select } from '@/ui/Field'
import { PhotoStrip } from '@/ui/PhotoStrip'
import { Steps } from '@/ui/Section'
import { StepSlide } from '@/ui/StepSlide'
import { Text } from '@/ui/Text'
import { colour, radius, space } from '@/ui/theme'
import type { CheckForm } from './check-form'
import type { PickedPhoto } from './photos'
import type { Recheck } from './use-recheck'

/**
 * The check's first step: which animal, what is wrong in words, and photos.
 * The content only: the check tab keeps one `Screen` across its steps, and
 * its dock holds the way on.
 */
export function CheckDescribeStep({
  pets,
  form,
  photos,
  from,
  withRecord,
  noChecks,
  recheck,
  symptomsError,
  onChange,
  onDropRecheck,
  onAddPhotos,
  onRemovePhoto,
}: {
  pets: Pet[]
  form: CheckForm
  photos: PickedPhoto[]
  /** Which side the step came in from; null when it simply appeared. */
  from: 'left' | 'right' | null
  /** «Учтём медкарту» under the pet. */
  withRecord: boolean
  /** Nothing left on the balance, and whether an extra check may be asked for. */
  noChecks: { canRequest: boolean } | null
  recheck: Recheck | null
  symptomsError: string | null
  onChange: (patch: Partial<CheckForm>) => void
  onDropRecheck: () => void
  onAddPhotos: (source: 'camera' | 'library') => void
  onRemovePhoto: (index: number) => void
}) {
  const t = useText()
  const chosen = pets.find((pet) => pet.id === form.petId)
  return (
    <StepSlide from={from}>
      <Steps current={1} of={2} label={t.check.step} />

      {/* Right under the steps, where a choice is looked for. With several
          animals, a sheet rather than a row of names, which stops fitting
          as soon as somebody has a few. With one there is nothing to
          choose: a quiet line, not its name in the middle of the screen,
          the most valuable place on it (FB-1/05). */}
      {pets.length > 1 ? (
        <Select
          label={t.check.pet}
          allowNone={false}
          options={pets.map((pet) => ({ value: pet.id, label: pet.name }))}
          value={form.petId}
          onChange={(petId) => onChange({ petId })}
        />
      ) : (
        <Text variant="h3" style={styles.onlyPet}>
          {t.check.forPet(chosen?.name ?? pets[0].name)}
        </Text>
      )}
      {withRecord ? (
        <Text variant="caption" tone="muted" style={styles.recordCaption}>
          {t.check.recordCaption}
        </Text>
      ) : null}

      {/* Said before the form is filled in, not after: with nothing on the
          balance both steps ended in «Не хватает проверок». The form stays
          usable — a request granted while it is open is a check to send. */}
      {noChecks ? (
        <View style={styles.noChecks}>
          <Banner text={t.check.noChecksLeft} tone="note" />
          {noChecks.canRequest ? (
            <LinkButton title={t.profile.extraRequest} align="left" onPress={() => router.push('/check/extra-check')} />
          ) : null}
        </View>
      ) : null}

      {recheck ? (
        <View style={styles.recheck}>
          <View style={styles.recheckText}>
            <Text variant="bodyStrong">{t.followup.recheckContext(recheck.date, recheck.answers)}</Text>
            <Text variant="caption" tone="muted">
              {t.followup.recheckCost}
            </Text>
          </View>
          <LinkButton title={t.followup.recheckDrop} onPress={onDropRecheck} />
        </View>
      ) : null}

      <Field
        label={t.check.symptoms}
        value={form.symptoms}
        onChangeText={(symptoms) => onChange({ symptoms })}
        placeholder={recheck ? t.followup.recheckPlaceholder : t.check.symptomsPlaceholder}
        error={symptomsError}
        multiline
      />

      <PhotoStrip t={t} photos={photos} onAdd={onAddPhotos} onRemove={onRemovePhoto} />

      <Banner text={t.check.symptomsHint} />
    </StepSlide>
  )
}

const styles = StyleSheet.create({
  recheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.row,
    backgroundColor: colour.accentSoft,
    borderRadius: radius.field,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: space.row,
  },
  recheckText: { flex: 1, gap: 2 },
  recordCaption: { marginTop: -8, marginBottom: 16 },
  onlyPet: { marginBottom: space.row },
  noChecks: { marginBottom: space.block },
})
