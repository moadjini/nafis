import type { MetadataRoute } from "next";

// Installable web app. The name is the same in Somali and English.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Nafis",
    short_name: "Nafis",
    description: "Meel aad ku nafiso. A place to let it out.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["health", "lifestyle", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
