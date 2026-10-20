// Flat ESLint config (ESLint 9) — mirrors the app repo's typescript-eslint
// setup, trimmed for a standalone library.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // The precompiled schema validators are generated code (engine#261).
    // docs-site/ carries the Mermaid bundle the docs pages load (engine#272);
    // like docs-api/ it is a gitignored build output, not source.
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "docs-api/**",
      "docs-site/**",
      "src/schema-validators.generated.ts",
    ],
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
        fetch: "readonly",
      },
    },
  },
);
