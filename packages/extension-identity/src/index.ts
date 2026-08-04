export const EXTENSION_AUTH_REDIRECT_PATH = "serial-auth";
export const CHROME_EXTENSION_MANIFEST_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz6erNNcBr2lZ+NMB8IFlHdfHhoCOH5b30EQhVM0yjxEW63uNVLiSfxYN7CNa9vHe0bPUat+DFHAky0/4fw2W0HWUXsbAvPVFDXvIEWdf0pwk2lqSgRwbiM/RB4uBuGNxnwc0YXQY5iM0isqxORm8CrpIv7BSsU3aaoOlL7gIsiELaJDb3Q+xduL7Hv/bjRC9EbBgiYhVsw4VnYoQQjPbwp/6cT5bGNig2DFokI+EdVb9nE1ExklAbja6Qk7zJKDomoit4E3kjNZBNvgRfX8cJwY4wxctiv2kkdZ+LRuG5ibXEKwzd2syu0fSgV0yxxBzFwYpxVI98qHEWW54RSCcowIDAQAB";
export const CHROME_EXTENSION_ID = "olpaonddchkbjpmjjfamplfaibopllam";
export const FIREFOX_EXTENSION_ID = "serial@megaflora.net";

export const EXTENSION_IDENTITY_REDIRECT_URIS = {
  chrome: `https://${CHROME_EXTENSION_ID}.chromiumapp.org/${EXTENSION_AUTH_REDIRECT_PATH}`,
  firefox: `https://854bc1aa653d4d81ecb8ca73d66e35ec8bd16b60.extensions.allizom.org/${EXTENSION_AUTH_REDIRECT_PATH}`,
} as const;
