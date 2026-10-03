import type { Metadata } from "next";
import { Manrope, Onest } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const onest = Onest({ subsets: ["latin"], variable: "--font-onest", display: "swap" });

export const metadata: Metadata = {
  title: "KraxxDeceit — Hostile Web Research Engine",
  description:
    "Execute hostile URLs in isolated research sandboxes and turn observed behavior into portable security cases.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${onest.variable}`}>{children}</body>
    </html>
  );
}
