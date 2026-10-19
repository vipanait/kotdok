/**
 * Store pages of the Lapka app. The QR codes in public/images/app-download
 * encode these exact strings: change a link, regenerate its code.
 */
export const APP_STORE_LINKS = {
  // No storefront in the path: Apple opens the visitor's own store.
  ios: 'https://apps.apple.com/app/id6813030153',
  android: 'https://play.google.com/store/apps/details?id=my.lapka.app',
} as const
