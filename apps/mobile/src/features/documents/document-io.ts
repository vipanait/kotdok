import { Linking, Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as Sharing from 'expo-sharing'
import * as WebBrowser from 'expo-web-browser'
import { requireOptionalNativeModule } from 'expo'
import { File } from 'expo-file-system'
import { withFreshSession } from '@/lib/api'
import { prepareDocumentPhoto, putFile } from '@/lib/photo-io'
import { checkPdf, photoTooLarge, type PageProblem, type PickedPage, type PageSource } from './page-list'
import { pdfOpening } from './document-view'
import { pdfPickerFrom, type PdfPicker } from './pdf-picker'
import type { UploadDeps } from './upload-document'

/**
 * The native half of a document's pages (DOC-1): the camera, the library,
 * the PDF picker when the app has one, making photos small, and sending the
 * bytes. The rules are in `page-list.ts`; this file only touches the phone.
 */

let picker: PdfPicker | null | undefined

/** The PDF picker of this installed app, or null: see `pdf-picker.ts`. Asked once. */
export function pdfPicker(): PdfPicker | null {
  if (picker === undefined) picker = pdfPickerFrom((name) => requireOptionalNativeModule(name))
  return picker
}

/** What a pick brought: pages ready to add, files that cannot be pages, or a refused camera. */
export type PickResult = { pages: PickedPage[]; problems: PageProblem[]; denied?: boolean }

const NOTHING: PickResult = { pages: [], problems: [] }

async function preparePhotos(
  assets: ImagePicker.ImagePickerAsset[],
  source: Exclude<PageSource, 'pdf'>,
): Promise<PickResult> {
  const pages: PickedPage[] = []
  const problems: PageProblem[] = []
  for (const asset of assets) {
    const name = source === 'library' ? (asset.fileName ?? null) : null
    // Said by the name the phone knows it by, even a camera photo's.
    const said = name ?? asset.fileName ?? asset.uri.split('/').pop() ?? ''
    try {
      const prepared = await prepareDocumentPhoto({ uri: asset.uri, width: asset.width, height: asset.height })
      if (photoTooLarge(prepared.size)) {
        problems.push({ reason: 'image_too_large', name: said })
        continue
      }
      pages.push({ uri: prepared.uri, contentType: prepared.contentType, size: prepared.size, name, source })
    } catch {
      // A file the phone cannot decode: said by name, the others are kept.
      problems.push({ reason: 'unreadable', name: said })
    }
  }
  return { pages, problems }
}

/** One photo from the camera. Asks for the camera first; a refusal is an answer, not an error. */
export async function pickFromCamera(): Promise<PickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) return { ...NOTHING, denied: true }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
  if (result.canceled) return NOTHING
  return preparePhotos(result.assets, 'camera')
}

/**
 * Photos from the library, up to `room`, in the order tapped. The system
 * picker hands over only the chosen photos and needs no access to the rest.
 */
export async function pickFromLibrary(room: number): Promise<PickResult> {
  if (room <= 0) return NOTHING
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: room,
    orderedSelection: true,
    quality: 1,
  })
  if (result.canceled) return NOTHING
  return preparePhotos(result.assets, 'library')
}

/** One PDF through the document picker, sent as it is. Nothing when this app has no picker. */
export async function pickPdf(): Promise<PickResult> {
  const available = pdfPicker()
  if (!available) return NOTHING
  const file = await available.pick()
  if (!file) return NOTHING
  const problem = checkPdf(file)
  if (problem) return { pages: [], problems: [{ reason: problem, name: file.name }] }
  // A picker that did not say the size: the file itself does.
  let size = file.size
  if (size === null) {
    try {
      size = new File(file.uri).size
    } catch {
      return { pages: [], problems: [{ reason: 'unreadable', name: file.name }] }
    }
    const measured = checkPdf({ ...file, size })
    if (measured) return { pages: [], problems: [{ reason: measured, name: file.name }] }
  }
  return { pages: [{ uri: file.uri, contentType: 'application/pdf', size, name: file.name, source: 'pdf' }], problems: [] }
}

/** One page to storage through its signed URL. */
export function putPage(url: string, headers: Record<string, string>, page: PickedPage): Promise<boolean> {
  return putFile(url, headers, page.uri)
}

/** A PDF picked on this phone, before it is sent: the system's preview (with its share sheet). */
export async function openLocalPdf(uri: string): Promise<boolean> {
  try {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })
    return true
  } catch {
    return false
  }
}

/**
 * A stored PDF through its signed read link: shown in the in-app browser on
 * iOS; on Android handed to the browser, which saves it to Downloads (a
 * Custom Tab would only leave a blank page behind) — the screens say so
 * (`pdfOpening`).
 */
export async function openStoredPdf(url: string): Promise<boolean> {
  try {
    if (pdfOpening(Platform.OS) === 'download') await Linking.openURL(url)
    else await WebBrowser.openBrowserAsync(url)
    return true
  } catch {
    return false
  }
}

/**
 * The upload's calls, each through a fresh session on its own: a token that
 * runs out between the pages refreshes for the next call, and never sends
 * the whole upload again (which would ask for a second document).
 */
export const uploadDeps: UploadDeps = {
  createDocument: (petId, body) => withFreshSession((api) => api.createDocument(petId, body)),
  completeDocument: (petId, docId) => withFreshSession((api) => api.completeDocument(petId, docId)),
  getDocument: (petId, docId) => withFreshSession((api) => api.getDocument(petId, docId)),
  put: putPage,
}
