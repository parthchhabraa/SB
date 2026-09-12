import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Study tracker",
    short_name: "Study",
    description: "Track study time, set goals, earn rewards you pick yourself.",
    start_url: "/",
    display: "standalone",
    background_color: "#16181A",
    theme_color: "#16181A",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
