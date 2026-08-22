import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import mkcert from "vite-plugin-mkcert";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    mkcert(),
  ],

  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,

    hmr: {
      port: 3000,
    },

    watch: {
      ignored: ["**/.vs/**"],
    },
  },
});