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
  metadataBase: new URL("https://www.murathanyazar.com.tr"),

  title: {
    default: "Murathan Yazar | Berber",
    template: "%s | Murathan Yazar",
  },

  description:
    "Murathan Yazar Berber - Online randevunuzu kolayca oluşturun, berber hizmetlerini, fiyatları ve çalışma saatlerini görüntüleyin.",

  applicationName: "Murathan Yazar | Berber",

  authors: [
    {
      name: "Murathan Yazar",
    },
  ],

  creator: "Murathan Yazar",
  publisher: "Murathan Yazar",

  keywords: [
    "Murathan Yazar",
    "Murathan Yazar Berber",
    "Murathan Yazar berber randevu",
    "Murathan Yazar randevu",
    "Murathan Yazar kuaför",
    "berber",
    "erkek berberi",
    "berber randevu",
    "online berber randevu",
    "saç kesimi",
    "sakal kesimi",
  ],

  alternates: {
    canonical: "https://www.murathanyazar.com.tr",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  openGraph: {
    title: "Murathan Yazar | Berber",

    description:
      "Online randevunuzu kolayca oluşturun. Hizmetleri, fiyatları ve çalışma saatlerini görüntüleyin.",

    url: "https://www.murathanyazar.com.tr",

    siteName: "Murathan Yazar | Berber",

    locale: "tr_TR",

    type: "website",

    images: [
      {
        url: "https://www.murathanyazar.com.tr/og-image.png",
        secureUrl: "https://www.murathanyazar.com.tr/og-image.png",
        width: 1200,
        height: 630,
        alt: "Murathan Yazar | Berber",
        type: "image/png",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",

    title: "Murathan Yazar | Berber",

    description:
      "Tarzına uygun kesim, sana uygun saat. Murathan Yazar berber salonu için hemen online randevu al, fiyatları ve çalışma saatlerini incele.",

    images: ["https://www.murathanyazar.com.tr/og-image.png"],
  },

  icons: {
    icon: "/my-logo.png",
    shortcut: "/my-logo.png",
    apple: "/my-logo.png",
  },
};

const businessSchema = {
  "@context": "https://schema.org",
  "@type": "HairSalon",
  "@id": "https://www.murathanyazar.com.tr/#business",

  name: "Murathan Yazar",
  alternateName: "Murathan Yazar Berber",

  description:
    "Murathan Yazar Berber - Online randevu, saç kesimi, sakal kesimi ve berber hizmetleri.",

  url: "https://www.murathanyazar.com.tr",

  telephone: "+905331288639",

  image: "https://www.murathanyazar.com.tr/og-image.png",

  logo: "https://www.murathanyazar.com.tr/my-logo.png",

  geo: {
    "@type": "GeoCoordinates",
    latitude: 40.922444,
    longitude: 29.154444,
  },

  sameAs: [
    "https://www.instagram.com/murathanyazar",
  ],

  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      opens: "10:00",
      closes: "22:00",
    },
  ],

  priceRange: "₺₺",

  currenciesAccepted: "TRY",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(businessSchema),
          }}
        />

        {children}
      </body>
    </html>
  );
}