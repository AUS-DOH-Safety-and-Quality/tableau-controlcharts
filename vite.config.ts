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
      input: ["spc/index.html", "funnels/index.html"]
    }
  }
});
