#!/usr/bin/env bash

set -euo pipefail

: "${CHROME_ACCESS_TOKEN:?CHROME_ACCESS_TOKEN must be set}"
: "${CHROME_PUBLISHER_ID:?CHROME_PUBLISHER_ID must be set}"
: "${CHROME_EXTENSION_ID:?CHROME_EXTENSION_ID must be set}"
: "${FIREFOX_EXTENSION_ID:?FIREFOX_EXTENSION_ID must be set}"
: "${FIREFOX_JWT_ISSUER:?FIREFOX_JWT_ISSUER must be set}"
: "${FIREFOX_JWT_SECRET:?FIREFOX_JWT_SECRET must be set}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
curl_bin="${CURL_BIN:-curl}"
chrome_api_origin="${CHROME_WEB_STORE_API_ORIGIN:-https://chromewebstore.googleapis.com}"
firefox_api_origin="${FIREFOX_ADDONS_API_ORIGIN:-https://addons.mozilla.org/api/v5}"
chrome_status_url="$chrome_api_origin/v2/publishers/$CHROME_PUBLISHER_ID/items/$CHROME_EXTENSION_ID:fetchStatus"
firefox_versions_url="$firefox_api_origin/addons/addon/$FIREFOX_EXTENSION_ID/versions/?filter=all_without_unlisted&page_size=50"
response_dir="$(mktemp -d)"
trap 'rm -rf "$response_dir"' EXIT

request() {
  local response_file="$1"
  local authorization="$2"
  local url="$3"

  if ! "$curl_bin" \
    --fail-with-body \
    --show-error \
    --silent \
    --retry 4 \
    --retry-all-errors \
    --connect-timeout 15 \
    --max-time 120 \
    --header "Authorization: $authorization" \
    --output "$response_file" \
    --request GET \
    "$url"; then
    echo "Extension store readiness request failed:" >&2
    jq . "$response_file" >&2 2>/dev/null || sed -n '1,120p' "$response_file" >&2
    return 1
  fi
}

blocked=false
chrome_response="$response_dir/chrome.json"
request "$chrome_response" "Bearer $CHROME_ACCESS_TOKEN" "$chrome_status_url"
chrome_state="$(
  jq -r '.submittedItemRevisionStatus.state // empty' "$chrome_response"
)"
chrome_version="$(
  jq -r \
    '.submittedItemRevisionStatus.distributionChannels[0].crxVersion // empty' \
    "$chrome_response"
)"
case "$chrome_state" in
  PENDING_REVIEW | STAGED)
    echo \
      "Chrome revision ${chrome_version:-unknown} is $chrome_state." \
      >&2
    blocked=true
    ;;
esac

firefox_token="$(node "$script_dir/generate-amo-jwt.mjs")"
firefox_response="$response_dir/firefox.json"
request "$firefox_response" "JWT $firefox_token" "$firefox_versions_url"
if ! jq -e '.results | type == "array"' "$firefox_response" > /dev/null; then
  echo "Firefox returned an unexpected versions response." >&2
  jq . "$firefox_response" >&2
  exit 1
fi
firefox_pending_versions="$(
  jq -r \
    '[.results[]? | select(.file.status == "unreviewed") | .version] | join(", ")' \
    "$firefox_response"
)"
if [[ -n "$firefox_pending_versions" ]]; then
  echo \
    "Firefox revision(s) $firefox_pending_versions are awaiting review." \
    >&2
  blocked=true
fi

if [[ "$blocked" == "true" ]]; then
  echo \
    "The synchronized browser-extension release is blocked. Preserve the active review and rerun the workflow after both stores are ready." \
    >&2
  exit 2
fi

echo "Chrome and Firefox are ready for a synchronized extension release."
