import Image from 'next/image'
import { APP_STORE_LINKS } from '@/shared/app-store-links'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

const STORES = [
  {
    key: 'ios',
    href: APP_STORE_LINKS.ios,
    name: 'App Store',
    qr: '/images/app-download/qr-ios.svg',
    mark: '/images/app-download/apple-mark.svg',
  },
  {
    key: 'android',
    href: APP_STORE_LINKS.android,
    name: 'Google Play',
    qr: '/images/app-download/qr-android.svg',
    mark: '/images/app-download/google-play-mark.svg',
  },
] as const

/**
 * The landing's app block (docs/design/app-download). A computer gets QR codes
 * to scan with a phone; a phone gets plain store buttons. Both stores are
 * offered on every device: nothing guesses the visitor's OS.
 */
export default function AppDownloadSection({ dict }: { dict: Dictionary }) {
  const t = dict.home.appDownload
  const text = {
    ios: { platform: t.iosPlatform, qrAlt: t.iosQrAlt },
    android: { platform: t.androidPlatform, qrAlt: t.androidQrAlt },
  }

  return (
    <section id="app" className="app-download" aria-labelledby="app-title">
      <div className="app-download-copy">
        <div className="app-download-eyebrow">{t.eyebrow}</div>
        <h2 id="app-title">
          {t.titleLine1}
          <br />
          {t.titleLine2}
        </h2>
        <p>{t.description}</p>
      </div>

      {/* Hidden with display:none on the other width, so only one set is in the Tab order. */}
      <div className="app-download-qr">
        <ul>
          {STORES.map((store) => (
            <li key={store.key}>
              <Image src={store.qr} alt={text[store.key].qrAlt} width={152} height={152} />
              <a href={store.href}>
                {store.name} <span aria-hidden="true">↗</span>
              </a>
              <span>{text[store.key].platform}</span>
            </li>
          ))}
        </ul>
        <p>{t.scanHint}</p>
      </div>

      <div className="app-download-buttons">
        {STORES.map((store) => (
          <a key={store.key} href={store.href}>
            <Image src={store.mark} alt="" aria-hidden="true" width={24} height={24} />
            <span>
              {t.downloadIn} <strong>{store.name}</strong>
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}
