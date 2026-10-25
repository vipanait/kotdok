import { Manrope, Nunito } from "next/font/google";
import localFont from "next/font/local";

// The same pair as the mobile app: Nunito for headings, Manrope for text.
const nunito = Nunito({ subsets: ["latin", "cyrillic"], weight: ["700", "800"], variable: "--font-nunito" });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-manrope" });
// Google's sign-in button asks for Google Sans Medium; it is only used there.
// Subset to Latin and Cyrillic (docs/design/mobile-concept-v1/assets/GoogleSans.ttf).
const googleSans = localFont({
  src: "./fonts/GoogleSans-subset.woff2",
  weight: "500",
  variable: "--font-google-sans",
  display: "swap",
  preload: false,
});

/**
 * The site has two root layouts — the app, which follows the visitor's
 * language, and the static articles — and the global 404. All three put the
 * same font variables on `<html>`.
 */
export const fontVariables = `${nunito.variable} ${manrope.variable} ${googleSans.variable}`;
