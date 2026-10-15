import { defineConfig } from "vitest/config";

// Tests du plugin : environnement Node par défaut. Les tests d'interface du
// lot C peuvent passer en jsdom fichier par fichier (`// @vitest-environment jsdom`).
export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts", "tests/**/*.spec.tsx"],
    environment: "node",
  },
});
