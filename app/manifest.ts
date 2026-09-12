import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Murathan Yazar | Berber",
    short_name: "Murathan Yazar",
    description: "Murathan Yazar Berber yönetim ve randevu uygulaması.",
    start_url: "/admin",
    display: "standalone",
    background_color: "#080808",
    theme_color: "#080808",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.png",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}