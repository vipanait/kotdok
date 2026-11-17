/**
 * The PDF picker, when the installed app has one (ruling R4 of the documents
 * design run).
 *
 * `expo-document-picker` is a native module and is not a dependency of this
 * build: adding it takes a new store build. Importing its JS package would
 * break the bundle (Metro resolves every `require` while bundling, so a
 * try/catch around it does not help), so the app asks for the native module
 * itself by name. A build without it gets null and shows two buttons; a build
 * with it — after `npx expo install expo-document-picker` and a store build —
 * gets the third with no change here.
 *
 * Kept free of native imports so the rules are tested in plain Node; the
 * screens pass `requireOptionalNativeModule` from `expo` as `load`.
 */

/** One picked file, as `ExpoDocumentPicker.getDocumentAsync` hands it over. */
export type PickedFile = { uri: string; name: string; size: number | null; mimeType: string | null }

export type PdfPicker = {
  /** The chosen PDF, or null when the picker was closed without one. */
  pick: () => Promise<PickedFile | null>
}

/** The native module's name in expo-document-picker (`requireNativeModule('ExpoDocumentPicker')`). */
export const DOCUMENT_PICKER_MODULE = 'ExpoDocumentPicker'

type NativePicker = { getDocumentAsync: (options: Record<string, unknown>) => Promise<unknown> }

function isNativePicker(value: unknown): value is NativePicker {
  return !!value && typeof (value as { getDocumentAsync?: unknown }).getDocumentAsync === 'function'
}

/** The first asset of a picker's answer, read defensively: the module is not a typed dependency. */
export function firstAsset(result: unknown): PickedFile | null {
  if (!result || typeof result !== 'object') return null
  const { canceled, assets } = result as { canceled?: unknown; assets?: unknown }
  if (canceled === true || !Array.isArray(assets) || assets.length === 0) return null
  const asset = assets[0] as { uri?: unknown; name?: unknown; size?: unknown; mimeType?: unknown } | null
  if (!asset || typeof asset.uri !== 'string') return null
  return {
    uri: asset.uri,
    name: typeof asset.name === 'string' && asset.name.trim() ? asset.name : asset.uri.split('/').pop() || 'document.pdf',
    size: typeof asset.size === 'number' ? asset.size : null,
    mimeType: typeof asset.mimeType === 'string' ? asset.mimeType : null,
  }
}

/**
 * The picker when `load` finds the native module, null otherwise — also when
 * asking throws: a missing module must cost a button, never the screen.
 */
export function pdfPickerFrom(load: (name: string) => unknown): PdfPicker | null {
  let native: unknown
  try {
    native = load(DOCUMENT_PICKER_MODULE)
  } catch {
    return null
  }
  if (!isNativePicker(native)) return null
  return {
    pick: async () =>
      firstAsset(
        // The options the JS package passes for `getDocumentAsync({ type: 'application/pdf' })`.
        await native.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true, multiple: false, base64: false }),
      ),
  }
}
