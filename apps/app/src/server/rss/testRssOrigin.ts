import {
  authorizedTestLoopbackOrigin,
  isAuthorizedTestLoopbackUrl,
} from "~/server/http/testLoopbackOrigin";

export function authorizedTestRssOrigin() {
  return authorizedTestLoopbackOrigin(
    "SERIAL_TEST_RSS_ALLOW_LOOPBACK",
    "SERIAL_TEST_RSS_ORIGIN",
  );
}

export function isAuthorizedTestRssUrl(value: string) {
  return isAuthorizedTestLoopbackUrl(
    value,
    "SERIAL_TEST_RSS_ALLOW_LOOPBACK",
    "SERIAL_TEST_RSS_ORIGIN",
  );
}
