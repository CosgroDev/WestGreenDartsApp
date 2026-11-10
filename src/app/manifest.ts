import type { MetadataRoute } from "next";

// Lets the app be added to a phone's home screen and opened full-screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "West Green Darts",
    short_name: "West Green",
    description: "Live 501 scoring, fixtures and stats for the West Green darts team",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#070d18",
    theme_color: "#070d18",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
