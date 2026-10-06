import type { Metadata } from "next";
import { Manrope, Onest } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const onest = Onest({ subsets: ["latin"], variable: "--font-onest", display: "swap" });

export const metadata: Metadata = {
  title: "KraxxDeceit — Hostile Web Research Engine",
  description:
    "Explore controlled browser experiments, inspect behavioral evidence, and export portable security research cases.",
  metadataBase: new URL('https://kraxxdeceit.kraxxsec.com'),
  openGraph: { title: 'KraxxDeceit — Controlled Security Research', description: 'Disposable browser experiments, inspectable evidence and portable research cases.', url: 'https://kraxxdeceit.kraxxsec.com', type: 'website', images: ['/kraxxdeceit-mark.png'] },
  twitter: { card: 'summary', title: 'KraxxDeceit — Controlled Security Research', description: 'Disposable browser experiments, inspectable evidence and portable research cases.', images: ['/kraxxdeceit-mark.png'] },
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
