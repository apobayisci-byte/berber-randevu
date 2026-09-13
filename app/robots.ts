import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api"],
    },

    sitemap: "https://www.murathanyazar.com.tr/sitemap.xml",
    host: "https://www.murathanyazar.com.tr",
  };
}