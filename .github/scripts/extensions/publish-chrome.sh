#!/usr/bin/env bash

set -euo pipefail

chrome_zip="${1:?usage: publish-chrome.sh <chrome-zip>}"
: "${CHROME_ACCESS_TOKEN:?CHROME_ACCESS_TOKEN must be set}"
: "${CHROME_PUBLISHER_ID:?CHROME_PUBLISHER_ID must be set}"
: "${CHROME_EXTENSION_ID:?CHROME_EXTENSION_ID must be set}"

if [[ ! -f "$chrome_zip" ]]; then
  echo "Chrome extension package not found: $chrome_zip" >&2
  exit 1
fi

curl_bin="${CURL_BIN:-curl}"
sleep_bin="${SLEEP_BIN:-sleep}"
api_origin="${CHROME_WEB_STORE_API_ORIGIN:-https://chromewebstore.googleapis.com}"
item_name="publishers/$CHROME_PUBLISHER_ID/items/$CHROME_EXTENSION_ID"
status_url="$api_origin/v2/$item_name:fetchStatus"
upload_url="$api_origin/upload/v2/$item_name:upload"
publish_url="$api_origin/v2/$item_name:publish"
response_dir="$(mktemp -d)"
trap 'rm -rf "$response_dir"' EXIT

request() {
  local response_file="$1"
  shift

  if ! "$curl_bin" \
    --fail-with-body \
    --show-error \
    --silent \
    --connect-timeout 15 \
    --max-time 120 \
    --header "Authorization: Bearer $CHROME_ACCESS_TOKEN" \
    --output "$response_file" \
    "$@"; then
    echo "Chrome Web Store API request failed:" >&2
    jq . "$response_file" >&2 2>/dev/null || sed -n '1,120p' "$response_file" >&2
    return 1
  fi
}

fetch_status() {
  local response_file="$1"
  request \
    "$response_file" \
    --retry 4 \
    --retry-all-errors \
    --request GET \
    "$status_url"
}

status_response="$response_dir/status.json"
fetch_status "$status_response"

submitted_state="$(
  jq -r '.submittedItemRevisionStatus.state // empty' "$status_response"
)"
submitted_version="$(
  jq -r \
    '.submittedItemRevisionStatus.distributionChannels[0].crxVersion // empty' \
    "$status_response"
)"

case "$submitted_state" in
  PENDING_REVIEW | STAGED)
    echo \
      "Chrome revision ${submitted_version:-unknown} is $submitted_state; preserve it and rerun this job after the store finishes processing it." \
      >&2
    exit 2
    ;;
esac

upload_response="$response_dir/upload.json"
request \
  "$upload_response" \
  --request POST \
  --header "Content-Type: application/zip" \
  --upload-file "$chrome_zip" \
  "$upload_url"

upload_state="$(jq -r '.uploadState // empty' "$upload_response")"
uploaded_version="$(jq -r '.crxVersion // empty' "$upload_response")"

if [[ "$upload_state" == "IN_PROGRESS" ]]; then
  for _ in {1..12}; do
    "$sleep_bin" 5
    fetch_status "$status_response"
    upload_state="$(jq -r '.lastAsyncUploadState // empty' "$status_response")"
    if [[ "$upload_state" != "IN_PROGRESS" ]]; then
      break
    fi
  done
fi

if [[ "$upload_state" != "SUCCEEDED" ]]; then
  echo "Chrome package upload did not succeed (state: ${upload_state:-missing})." >&2
  jq . "$upload_response" >&2
  exit 1
fi

publish_response="$response_dir/publish.json"
request \
  "$publish_response" \
  --request POST \
  --header "Content-Type: application/json" \
  --data '{"publishType":"DEFAULT_PUBLISH","deployInfos":[{"deployPercentage":100}],"skipReview":false,"blockOnWarnings":true}' \
  "$publish_url"

publish_state="$(jq -r '.state // empty' "$publish_response")"
case "$publish_state" in
  PENDING_REVIEW | PUBLISHED)
    ;;
  *)
    echo \
      "Chrome submission returned an unexpected state: ${publish_state:-missing}." \
      >&2
    jq . "$publish_response" >&2
    exit 1
    ;;
esac

echo \
  "Chrome extension ${uploaded_version:-unknown} submitted successfully ($publish_state)."
