import { StyleSheet, View } from 'react-native'
import { ACTIVITY_VALUES, APPETITE_VALUES, DURATION_VALUES, PAIN_SIGNS, STOOL_VALUES } from '@lapka/contracts'
import { useText } from '@/i18n'
import { LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Chips, Segment, Select } from '@/ui/Field'
import { Steps, SummaryCard } from '@/ui/Section'
import { StepSlide } from '@/ui/StepSlide'
import { Text } from '@/ui/Text'
import { toggleSign, type CheckForm } from './check-form'

/**
 * The check's second step: what the first one captured, to change, and the
 * optional answers — appetite, activity, how long, stool, signs of pain.
 * The content only: the check tab keeps one `Screen` across its steps, and
 * its dock holds «Отправить».
 */
export function CheckDetailsStep({
  petName,
  form,
  photoCount,
  from,
  onChange,
  onBack,
}: {
  petName: string | null
  form: CheckForm
  photoCount: number
  /** Which side the step came in from; null when it simply appeared. */
  from: 'left' | 'right' | null
  onChange: (patch: Partial<CheckForm>) => void
  onBack: () => void
}) {
  const t = useText()
  return (
    <StepSlide from={from}>
      <Steps current={2} of={2} label={t.check.step} />

      <SummaryCard>
        <View style={styles.summaryCopy}>
          <Text variant="h3">{petName ?? t.check.noPet}</Text>
          <Text variant="label" tone="muted" numberOfLines={1}>
            {form.symptoms}
          </Text>
          {photoCount > 0 ? (
            <Text variant="caption" tone="faint">
              {t.check.photoCount(photoCount)}
            </Text>
          ) : null}
        </View>
        <LinkButton title={t.check.change} onPress={onBack} />
      </SummaryCard>

      <Banner text={t.check.optionalHint} />

      <Segment
        label={t.check.appetite}
        options={APPETITE_VALUES.map((value) => ({ value, label: t.appetite[value] }))}
        value={form.appetite}
        onChange={(appetite) => onChange({ appetite })}
      />
      <Segment
        label={t.check.activity}
        options={ACTIVITY_VALUES.map((value) => ({ value, label: t.activity[value] }))}
        value={form.activity}
        onChange={(activity) => onChange({ activity })}
      />
      <Segment
        label={t.check.duration}
        options={DURATION_VALUES.map((value) => ({ value, label: t.duration[value] }))}
        value={form.duration}
        onChange={(duration) => onChange({ duration })}
      />
      <Select
        label={t.check.stool}
        options={STOOL_VALUES.map((value) => ({ value, label: t.stool[value] }))}
        value={form.stool}
        onChange={(stool) => onChange({ stool })}
      />
      <Chips
        label={t.check.painSigns}
        options={PAIN_SIGNS.map((value) => ({ value, label: t.pain[value] }))}
        values={form.painSigns}
        onToggle={(sign) => onChange({ painSigns: toggleSign(form.painSigns, sign) })}
      />
    </StepSlide>
  )
}

const styles = StyleSheet.create({
  summaryCopy: { flex: 1, minWidth: 0 },
})
