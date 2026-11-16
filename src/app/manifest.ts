import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Altum CRM",
    short_name: "Altum",
    description: "CRM para times comerciais",
    start_url: "/painel",
    display: "standalone",
    background_color: "#0b0d0c",
    theme_color: "#0b0d0c",
    lang: "pt-BR",
    icons: [
      { src: "/brand/altum-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/altum-app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
