import type { ComponentType } from 'react'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { documentRoute } from '@/features/documents/document-view'
import { devStatesEnabled } from '@/features/documents/recognition/dev/gate'

/**
 * The recognition states on fixtures, for a developer (ruling R1 of the
 * documents design run): `lapka://pets/<id>/documents/dev-states[?state=review]`
 * in a development build. Anywhere else — every build that leaves a
 * developer's machine — the address leads to the pet's documents and
 * nothing more.
 *
 * The preview and its fixtures are required only behind `__DEV__`: Metro
 * folds `__DEV__` to false in a release bundle and drops the branch, so the
 * test data is not even shipped.
 */
const Preview: ComponentType<{ petId: string; state?: string }> | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../../../src/features/documents/recognition/dev/DocumentsStatesPreview').DocumentsStatesPreview
  : null

export default function DocumentsDevStates() {
  const { id, state } = useLocalSearchParams<{ id: string; state?: string }>()
  if (!Preview || !devStatesEnabled()) return <Redirect href={documentRoute.list(id)} />
  return <Preview petId={id} state={state} />
}
