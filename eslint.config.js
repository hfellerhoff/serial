import eslint from "@eslint/js";
import { fixupConfigRules } from "@eslint/compat";
import { tanstackConfig } from "@tanstack/eslint-config";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
// @ts-expect-error - no type declarations available
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

const reactConfigs = fixupConfigRules(
  /** @type {import("eslint").Linter.Config[]} */ ([
    reactPlugin.configs.flat.recommended,
    reactPlugin.configs.flat["jsx-runtime"],
    reactHooksPlugin.configs.flat["recommended-latest"],
  ]),
).filter(Boolean);

export default tseslint.config(
  eslint.configs.recommended,
  ...tanstackConfig,
  ...reactConfigs,
  ...fixupConfigRules([jsxA11yPlugin.flatConfigs.recommended]),
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // TanStack Router's redirect() and notFound() are designed to be thrown
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
      "react-hooks/set-state-in-effect": "warn",
      "no-undef": "off",
      "sort-imports": [
        "error",
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          allowSeparatedGroups: true,
        },
      ],
    },
  },
  {
    ignores: [
      "**/src/server/scripts/*.ts",
      "package.json",
      "pnpm-lock.yaml",
      "src/server/db/migrations/",
      "node_modules/",
      ".output/",
      "dist/",
      "dist-sw/",
      ".content-collections/",
      "public/sw.js",
      "public/workbox-*.js",
    ],
  },
);
