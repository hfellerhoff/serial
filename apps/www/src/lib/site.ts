export const SITE_NAME = "Serial";
export const SITE_DESCRIPTION =
  "A calm, customizable, and non-algorithmic RSS reader. Lots of customization options and great support for video content. Fully open source and easily self-hostable.";

export const APP_URL: string =
  import.meta.env.WWW_APP_URL || "https://app.serial.tube";
export const DEMO_URL = "https://demo.serial.tube";
export const GITHUB_URL = "https://github.com/megaflorasoftware/serial";
export const SELF_HOSTING_URL = `${GITHUB_URL}?tab=readme-ov-file#self-hosting`;

export const SUPPORT_EMAIL_ADDRESS: string | undefined = import.meta.env
  .WWW_SUPPORT_EMAIL_ADDRESS;

export const STANDARD_SITE_PUBLICATION_URI: string | undefined = import.meta.env
  .WWW_STANDARD_SITE_PUBLICATION_URI;
