import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^powerbi-spc\/(.*)$/, replacement: "powerbi-spc/src/$1" },
      { find: /^powerbi-funnels\/(.*)$/, replacement: "powerbi-funnels/src/$1" }
    ]
  },
  build: {
    rollupOptions: {
      input: ["spc/index.html", "spc/settings.html", "funnels/index.html", "funnels/settings.html"]
    }
  }
});
