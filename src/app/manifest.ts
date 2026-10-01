import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "تولد — هماهنگی جمع دوستان",
    short_name: "تولد",
    description: "هماهنگی جمع دوستان، از برنامه‌ریزی تا تسویه",
    lang: "fa",
    dir: "rtl",
    start_url: "/groups",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: "#0f766e",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
