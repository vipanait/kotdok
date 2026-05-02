import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/server/i18n/get-locale";
import { getDictionary } from "@/server/i18n/get-dictionary";
import { LocaleProvider } from "@/components/LocaleProvider";

const geist = Geist({ subsets: ["latin"] });

const siteUrl = 'https://lapka.my'

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'Лапка',
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/icon.svg`,
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
      name: 'Лапка',
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
const title = 'Лапка — AI симптомчекер для кошек'
const description = 'Узнайте насколько серьёзны симптомы вашей кошки за 15 секунд. Опишите что происходит — получите чёткий ответ с уровнем срочности.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: '%s — Лапка',
  },
  description,
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: siteUrl,
    siteName: 'Лапка',
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  // Icons are auto-detected from src/app/icon.svg + src/app/apple-icon.svg.
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <html lang={locale} className="h-full">
      <body className={`${geist.className} min-h-full bg-gray-50`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <LocaleProvider locale={locale} dict={dict}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
