import { Platform } from 'react-native'
import { Directory, File, Paths } from 'expo-file-system'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import type { ShareDeps } from './share-flow'

/** A4 in points, as expo-print measures pages. */
const A4 = { width: 595, height: 842 }

/** Where named PDFs wait for the receiving app; swept on the next send. */
function folder(): Directory {
  const directory = new Directory(Paths.cache, 'vet-summary')
  if (!directory.exists) directory.create()
  return directory
}

/** expo-print, the cache directory and the system sheet behind `sharePdf`. */
export const nativeShare: ShareDeps = {
  keepAfterShare: Platform.OS === 'android',
  sweep() {
    const directory = new Directory(Paths.cache, 'vet-summary')
    if (directory.exists) directory.delete()
  },
  async print(html) {
    // No print margins: the page lays out its own, with the footer inside them.
    const { uri } = await Print.printToFileAsync({ html, ...A4, margins: { left: 0, right: 0, top: 0, bottom: 0 } })
    return uri
  },
  async rename(uri, fileName) {
    const target = new File(folder(), fileName)
    if (target.exists) target.delete()
    await new File(uri).move(target)
    return target.uri
  },
  share: (uri) => Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }),
  remove(uri) {
    const file = new File(uri)
    if (file.exists) file.delete()
  },
}
