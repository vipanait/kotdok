import type { Metadata } from "next";
import { Manrope, Nunito } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { getLocale } from "@/server/i18n/get-locale";
import { getDictionary } from "@/server/i18n/get-dictionary";
import { LocaleProvider } from "@/components/LocaleProvider";
import TimeZoneCookie from "@/components/TimeZoneCookie";
import { defaultSeo, siteName, siteUrl, supportEmail } from "@/shared/seo";

// The same pair as the mobile app: Nunito for headings, Manrope for text.
const nunito = Nunito({ subsets: ["latin", "cyrillic"], weight: ["700", "800"], variable: "--font-nunito" });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-manrope" });
// Google's sign-in button asks for Google Sans Medium; it is only used there.
const googleSans = localFont({
  src: "./fonts/GoogleSans.ttf",
  weight: "500",
  variable: "--font-google-sans",
  display: "swap",
  preload: false,
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
      description: 'AI-симптомчекер для кошек и собак. Опишите симптомы — получите уровень срочности за 15 секунд.',
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
    <html lang={locale} className={`${nunito.variable} ${manrope.variable} ${googleSans.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <LocaleProvider locale={locale} dict={dict}>
          {children}
          <TimeZoneCookie />
        </LocaleProvider>
      </body>
    </html>
  );
}
