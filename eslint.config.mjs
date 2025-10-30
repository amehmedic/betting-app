import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  {
    ...nextVitals,
    ...nextTs,

    rules: {
      // 🚫 disable the rule that complains about "any"
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // ⛔ optional global ignores (unchanged)
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;