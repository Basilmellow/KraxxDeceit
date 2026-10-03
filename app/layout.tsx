import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
