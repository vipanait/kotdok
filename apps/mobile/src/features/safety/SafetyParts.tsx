import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import type { PetSpecies } from '@lapka/contracts'
import { useText } from '@/i18n'
import { Avatar } from '@/ui/Card'
import { Text } from '@/ui/Text'
import { colour, radius, space } from '@/ui/theme'

/** The white rounded block every part of a «Можно ли» card sits in (pet-safety-v1, `.card`). */
export function SafetyPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>
}

/** «Рекс · собака», or «Собака» for a species picked by hand. */
export function subjectLine(t: ReturnType<typeof useText>, species: PetSpecies, petName: string | null): string {
  const kind = t.safety.speciesSwitch[species]
  return petName ? `${petName} · ${kind.toLocaleLowerCase()}` : kind
}

/**
 * «Для кого смотрим» on a card: whom the verdict below is for. It names the
 * pet only while the card is about that pet's species; the other species,
 * or a species picked by hand, shows the species alone. Not a control: the
 * pet is chosen on the search screen.
 */
export function SafetyContextCard({
  species,
  petName,
  avatarUri,
}: {
  species: PetSpecies
  petName: string | null
  avatarUri?: string | null
}) {
  const t = useText()
  const line = subjectLine(t, species, petName)
  return (
    <View style={styles.context} accessible accessibilityLabel={`${t.safety.subject}: ${line}`}>
      <Avatar species={species} size={38} uri={petName ? (avatarUri ?? null) : null} />
      <View style={styles.contextText}>
        <Text variant="caption" tone="muted">
          {t.safety.subject}
        </Text>
        <Text variant="bodyStrong">{line}</Text>
      </View>
    </View>
  )
}

/**
 * A state with nothing to list — nothing found, the limit, a failure, a
 * query that is not a thing, nothing published: a quiet white card under the
 * screen's own heading, read from the left — a title, a line, and what to do
 * next under them. No picture: the owner asked for these states without the
 * big glyph on a tile (handoff, «Уточнение: поиск, пустые результаты и ошибки»).
 */
export function SafetyState({
  title,
  body,
  children,
  style,
}: {
  title: string
  body?: string
  children?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.state, style]}>
      <Text variant="h2" accessibilityRole="header">
        {title}
      </Text>
      {body ? (
        <Text tone="muted" style={styles.stateBody}>
          {body}
        </Text>
      ) : null}
      {children ? <View style={styles.stateActions}>{children}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    padding: 18,
    marginBottom: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
  },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: space.block,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
  },
  contextText: { flex: 1 },
  state: {
    padding: space.block,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
  },
  stateBody: { marginTop: 8 },
  stateActions: { marginTop: space.block, gap: space.row },
})
