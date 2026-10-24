import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [{ find: /^powerbi-spc\/(.*)$/, replacement: "powerbi-spc/src/$1" }]
  }
});
