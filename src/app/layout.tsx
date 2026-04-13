import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "КотДок — AI симптомчекер для кошек",
  description: "Узнайте насколько серьёзны симптомы вашей кошки за 15 секунд",
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
