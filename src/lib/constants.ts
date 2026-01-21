export const IS_MAIN_INSTANCE =
  String(import.meta.env.VITE_PUBLIC_IS_MAIN_INSTANCE) === "true" ||
  String(process.env.VITE_PUBLIC_IS_MAIN_INSTANCE) === "true";

export const BASE_SIGNED_OUT_URL = IS_MAIN_INSTANCE
  ? "/welcome"
  : "/auth/sign-in";
