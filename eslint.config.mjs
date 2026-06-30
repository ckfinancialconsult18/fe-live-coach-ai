import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // API route handlers sit at a JSON/Supabase-generic boundary where `any`
    // is the pragmatic type for request bodies and insert/update payloads —
    // runtime DB constraints (NOT NULL/CHECK) are the real backstop here,
    // not TypeScript. Keep the rule strict everywhere else.
    files: ["app/api/**/*.ts", "lib/api/**/*.ts", "lib/rag/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
