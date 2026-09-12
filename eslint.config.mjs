import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// eslint-config-next ships flat configs directly, so FlatCompat is not needed.
const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // The brief rules out `any`, so it is an error rather than a warning.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".pgdata/**",
      "preview-dist/**",
      "shots/**",
    ],
  },
];

export default config;
