import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(async ({ command }) => {
  const plugins = [
    react(),
    tailwindcss(),
  ];

  if (command === "serve") {
    const { default: mkcert } = await import("vite-plugin-mkcert");
    plugins.push(mkcert());
  }

  return {
    plugins,

    base: "/new-visualizer/",

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
  };
});