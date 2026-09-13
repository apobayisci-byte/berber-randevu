import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://murathanyazar.com.tr"),

  title: "Murathan Yazar | Berber",

  description:
    "Murathan Yazar Berber - Online randevunuzu kolayca oluşturun, hizmetleri ve çalışma saatlerini görüntüleyin.",

  alternates: {
    canonical: "/",
  },

  openGraph: {
    title: "Murathan Yazar | Berber",
    description:
      "Online randevunuzu kolayca oluşturun. Hizmetleri, fiyatları ve çalışma saatlerini görüntüleyin.",
    url: "/",
    siteName: "Murathan Yazar | Berber",
    locale: "tr_TR",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Murathan Yazar | Berber",
    description:
      "Online randevunuzu kolayca oluşturun. Hizmetleri, fiyatları ve çalışma saatlerini görüntüleyin.",
  },

  icons: {
    icon: "/my-logo.png",
    apple: "/my-logo.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}