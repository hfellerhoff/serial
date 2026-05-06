export const IS_DEMO_INSTANCE =
  String(import.meta.env?.VITE_PUBLIC_IS_DEMO_INSTANCE) === "true" ||
  String(process.env?.IS_DEMO_INSTANCE) === "true";
