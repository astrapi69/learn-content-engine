// Flat ESLint config (ESLint 9) — mirrors the app repo's typescript-eslint
// setup, trimmed for a standalone library.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "docs-api/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Node-run helper scripts + the CLI shim (not part of the library build).
    files: ["scripts/**/*.mjs", "bin/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  },
);
