import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ehsaan Khata",
    short_name: "Ehsaan",
    description: "Keep track of favours in your group with Ehsaan Points.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffbf5",
    theme_color: "#b45309",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
