// @lovable.dev/vite-tanstack-config already includes TanStack Start, React,
// Tailwind, tsconfig paths and Nitro. Nitro is pinned to Vercel so this source
// can be pushed to GitHub and imported directly by Vercel without extra setup.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: {
    preset: "vercel",
  },
  tanstackStart: {
    // Keeps the custom SSR error wrapper used by this project.
    server: { entry: "server" },
  },
});
