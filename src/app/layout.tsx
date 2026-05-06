import type { Metadata } from "next";
import { Geist, Fraunces } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/server/i18n/get-locale";
import { getDictionary } from "@/server/i18n/get-dictionary";
import { LocaleProvider } from "@/components/LocaleProvider";
import { defaultSeo, siteName, siteUrl, supportEmail } from "@/shared/seo";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});

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
        email: supportEmail,
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
        description: '2 проверки бесплатно',
      },
      publisher: { '@id': `${siteUrl}/#organization` },
    },
  ],
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: defaultSeo.title,
    template: `%s — ${siteName}`,
  },
  description: defaultSeo.description,
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/',
    siteName,
    title: defaultSeo.title,
    description: defaultSeo.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultSeo.title,
    description: defaultSeo.description,
  },
  // Icons and social previews are auto-detected from app metadata files.
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <html lang={locale} className={`h-full ${geist.variable} ${fraunces.variable}`}>
      <body className="min-h-full bg-canvas font-sans">
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
