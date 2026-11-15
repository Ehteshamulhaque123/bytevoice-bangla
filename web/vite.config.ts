import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1000, // three.js is lazy-loaded behind the hero
    rollupOptions: {
      output: {
        // Keep the 3D engine and the voice SDK out of the first paint bundle.
        manualChunks(id) {
          if (id.includes("three") || id.includes("@react-three")) return "three";
          if (id.includes("@google/genai")) return "genai";
          if (id.includes("@supabase")) return "supabase";
        },
      },
    },
  },
});
