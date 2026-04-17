import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

const siteUrl = 'https://kotdok.ru'

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'КотДок',
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/android-chrome-512x512.png`,
      },
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'support@kotdok.ru',
        contactType: 'customer support',
      },
    },
    {
      '@type': 'WebApplication',
      '@id': `${siteUrl}/#app`,
      name: 'КотДок',
      url: siteUrl,
      description: 'AI-симптомчекер для кошек. Опишите симптомы — получите уровень срочности за 15 секунд.',
      applicationCategory: 'HealthApplication',
      operatingSystem: 'Web',
      inLanguage: 'ru',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'RUB',
        description: '3 проверки бесплатно',
      },
      publisher: { '@id': `${siteUrl}/#organization` },
    },
  ],
}
const title = 'КотДок — AI симптомчекер для кошек'
const description = 'Узнайте насколько серьёзны симптомы вашей кошки за 15 секунд. Опишите что происходит — получите чёткий ответ с уровнем срочности.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: '%s — КотДок',
  },
  description,
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: siteUrl,
    siteName: 'КотДок',
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="h-full">
      <body className={`${geist.className} min-h-full bg-gray-50`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
