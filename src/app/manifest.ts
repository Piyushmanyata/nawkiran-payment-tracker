import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nawkiran Payments",
    short_name: "Nawkiran",
    description: "Phone-first payment tracker for Nawkiran",
    start_url: "/open?source=pwa",
    scope: "/",
    id: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#ffffff",
    orientation: "portrait-primary",
    categories: ["finance", "business", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
