export const EXTENSION_AUTH_REDIRECT_PATH = "serial-auth";
export const EXTENSION_OAUTH_CLIENT_ID = "serial-browser-extension";
export const EXTENSION_OAUTH_SCOPES = [
  "openid",
  "profile",
  "offline_access",
] as const;
export const CHROME_EXTENSION_MANIFEST_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvq3bqhiFWK5G3Yi3g200Rg8k9kXUjs4Vkqutz1+Pk5+aKWjWKjnXG+pjG7eUyIq7wspsXHrJQcOV7RDRoWuVT0oTYok7J+kyYDGxZMHc5VS9ZADVKlvhB7HuM8pBE4HvU6dGu4sskAznN8co6XtTx0bZZyX+xp1R5EGncBUtycvc1BB93TRd2G29dLs5Cb/ek3zMk0pqrmNEgrZnLCNu536Oa5ViYJVWEZeg/qa3+rhE+cDux4pU9nRFE63p5TOb+dGmziQk89xKvsmS53P+CZPgzpXXhBnlHFjlC7O3pKn8W4TCxbhnPB7C3H+BzLzf10ZtKZeJri+h7Zsf/tA52QIDAQAB";
export const CHROME_EXTENSION_ID = "abfgpdgoffipbnfjcdoejalehhbegamc";
export const FIREFOX_EXTENSION_ID = "extension@serial.tube";

export const EXTENSION_IDENTITY_REDIRECT_URIS = {
  chrome: `https://${CHROME_EXTENSION_ID}.chromiumapp.org/${EXTENSION_AUTH_REDIRECT_PATH}`,
  firefox: `https://316a919b8777a95fa74b9564f4685cbe813b1a1d.extensions.allizom.org/${EXTENSION_AUTH_REDIRECT_PATH}`,
} as const;
