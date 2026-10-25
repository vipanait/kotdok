import type { Metadata } from "next";
import "../globals.css";
import { fontVariables } from "../fonts";
import { getLocale } from "@/server/i18n/get-locale";
import { getDictionary } from "@/server/i18n/get-dictionary";
import { LocaleProvider } from "@/components/LocaleProvider";
import { coreOf } from "@/shared/i18n/slices";
import TimeZoneCookie from "@/components/TimeZoneCookie";
import { siteUrl } from "@/shared/seo";
import { jsonLdScript, organizationId, organizationJsonLd, siteMetadata } from "@/shared/site-metadata";

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    organizationJsonLd,
    {
      '@type': 'WebApplication',
      '@id': `${siteUrl}/#app`,
      name: 'Лапка',
      url: siteUrl,
      description: 'AI-симптомчекер для кошек и собак. Опишите симптомы — получите уровень срочности за минуту.',
      applicationCategory: 'HealthApplication',
      operatingSystem: 'Web',
      inLanguage: 'ru',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'RUB',
        description: 'Бесплатно, без подписки и рекламы',
      },
      publisher: { '@id': organizationId },
    },
  ],
}

export const metadata: Metadata = siteMetadata;

/**
 * The root layout of the app and its public pages. It reads the visitor's
 * language from a cookie, so everything under it renders per request; the
 * static articles have their own root layout in `(content)`.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <html lang={locale} className={fontVariables}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
        />
        {/* The core only: each route group adds its own slice (shared/i18n/slices.ts). */}
        <LocaleProvider locale={locale} dict={coreOf(dict)}>
          {children}
          <TimeZoneCookie />
        </LocaleProvider>
      </body>
    </html>
  );
}
