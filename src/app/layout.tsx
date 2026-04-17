import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

const siteUrl = 'https://kotdok.ru'
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
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="h-full">
      <body className={`${geist.className} min-h-full bg-gray-50`}>{children}</body>
    </html>
  );
}
