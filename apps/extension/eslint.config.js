import eslint from "@eslint/js";
import { fixupConfigRules } from "@eslint/compat";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const reactConfigs = fixupConfigRules([
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat["jsx-runtime"],
  reactHooksPlugin.configs.flat["recommended-latest"],
]).filter(Boolean);

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...reactConfigs,
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // TypeScript and WXT's generated declarations provide the global types.
      "no-undef": "off",
    },
  },
  {
    ignores: [".output/", ".wxt/"],
  },
);
