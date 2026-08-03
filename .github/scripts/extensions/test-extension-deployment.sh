#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
version_generator="$script_dir/generate-version.mjs"
publisher="$script_dir/publish-chrome.sh"
readiness_check="$script_dir/check-store-readiness.sh"
fake_curl="$script_dir/test-fixtures/fake-curl.sh"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

assert_version() {
  local timestamp="$1"
  local expected="$2"
  local actual

  actual="$(RELEASE_TIMESTAMP="$timestamp" node "$version_generator")"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected version $expected for $timestamp, got $actual" >&2
    exit 1
  fi
}

assert_version "2026-01-01T00:00:00Z" "2026.1.0.0"
assert_version "2026-08-03T14:30:32Z" "2026.215.14.1832"
assert_version "2026-12-31T23:59:59Z" "2026.365.23.3599"

amo_jwt="$(
  FIREFOX_JWT_ISSUER=test-issuer \
    FIREFOX_JWT_SECRET=test-secret \
    node "$script_dir/generate-amo-jwt.mjs"
)"
amo_jwt_payload="$(
  node -e \
    'process.stdout.write(Buffer.from(process.argv[1], "base64url").toString())' \
    "$(cut -d. -f2 <<< "$amo_jwt")"
)"
if ! jq -e \
  '.iss == "test-issuer" and (.exp - .iat == 60) and (.jti | length > 0)' \
  <<< "$amo_jwt_payload" > /dev/null; then
  echo "AMO JWT did not contain the expected claims" >&2
  exit 1
fi

if RELEASE_TIMESTAMP="not-a-date" node "$version_generator" >/dev/null 2>&1; then
  echo "Expected an invalid release timestamp to fail" >&2
  exit 1
fi

chrome_zip="$temp_dir/chrome.zip"
printf 'test package\n' > "$chrome_zip"

run_publisher() {
  CHROME_ACCESS_TOKEN=test-token \
    CHROME_PUBLISHER_ID=test-publisher \
    CHROME_EXTENSION_ID=abcdefghijklmnopabcdefghijklmnop \
    CHROME_WEB_STORE_API_ORIGIN=https://chrome.example \
    CURL_BIN="$fake_curl" \
    SLEEP_BIN="${SLEEP_BIN:-sleep}" \
    FAKE_CURL_LOG="$temp_dir/curl.log" \
    FAKE_STATUS_RESPONSE="${FAKE_STATUS_RESPONSE-}" \
    FAKE_UPLOAD_RESPONSE="${FAKE_UPLOAD_RESPONSE-}" \
    FAKE_PUBLISH_RESPONSE="${FAKE_PUBLISH_RESPONSE-}" \
    FAKE_FAIL_ENDPOINT="${FAKE_FAIL_ENDPOINT:-}" \
    "$publisher" "$chrome_zip"
}

: > "$temp_dir/curl.log"
FAKE_STATUS_RESPONSE='{"submittedItemRevisionStatus":{"state":"PENDING_REVIEW","distributionChannels":[{"crxVersion":"2026.214.10.1"}]}}'
export FAKE_STATUS_RESPONSE
if run_publisher >"$temp_dir/pending.out" 2>&1; then
  echo "Expected a pending Chrome review to stop deployment" >&2
  exit 1
fi
if ! grep -q "preserve it and rerun" "$temp_dir/pending.out"; then
  echo "Pending-review failure did not include retry guidance" >&2
  exit 1
fi
if [[ "$(wc -l < "$temp_dir/curl.log" | tr -d ' ')" != "1" ]]; then
  echo "Pending-review deployment called Chrome after the status check" >&2
  exit 1
fi

: > "$temp_dir/curl.log"
FAKE_STATUS_RESPONSE='{}'
FAKE_UPLOAD_RESPONSE='{"itemId":"abcdefghijklmnopabcdefghijklmnop","crxVersion":"2026.215.14.1832","uploadState":"SUCCEEDED"}'
FAKE_PUBLISH_RESPONSE='{"itemId":"abcdefghijklmnopabcdefghijklmnop","state":"PENDING_REVIEW"}'
export FAKE_STATUS_RESPONSE FAKE_UPLOAD_RESPONSE FAKE_PUBLISH_RESPONSE
run_publisher > "$temp_dir/success.out"
if ! grep -q "submitted successfully" "$temp_dir/success.out"; then
  echo "Successful Chrome submission was not reported" >&2
  exit 1
fi
if [[ "$(wc -l < "$temp_dir/curl.log" | tr -d ' ')" != "3" ]]; then
  echo "Successful deployment did not call status, upload, and publish" >&2
  exit 1
fi

: > "$temp_dir/curl.log"
FAKE_STATUS_RESPONSE='{"lastAsyncUploadState":"SUCCEEDED"}'
FAKE_UPLOAD_RESPONSE='{"itemId":"abcdefghijklmnopabcdefghijklmnop","uploadState":"IN_PROGRESS"}'
FAKE_PUBLISH_RESPONSE='{"itemId":"abcdefghijklmnopabcdefghijklmnop","state":"PENDING_REVIEW"}'
SLEEP_BIN=true
export FAKE_STATUS_RESPONSE FAKE_UPLOAD_RESPONSE FAKE_PUBLISH_RESPONSE SLEEP_BIN
run_publisher > "$temp_dir/async-success.out"
if ! grep -q "submitted successfully" "$temp_dir/async-success.out"; then
  echo "Asynchronous Chrome upload was not submitted after processing" >&2
  exit 1
fi
unset SLEEP_BIN

: > "$temp_dir/curl.log"
FAKE_UPLOAD_RESPONSE='{"uploadState":"FAILED"}'
export FAKE_UPLOAD_RESPONSE
if run_publisher >"$temp_dir/upload-failure.out" 2>&1; then
  echo "Expected a failed Chrome upload to stop deployment" >&2
  exit 1
fi
if ! grep -q "upload did not succeed" "$temp_dir/upload-failure.out"; then
  echo "Failed Chrome upload did not report its state" >&2
  exit 1
fi

run_readiness_check() {
  CHROME_ACCESS_TOKEN=test-token \
    CHROME_PUBLISHER_ID=test-publisher \
    CHROME_EXTENSION_ID=abcdefghijklmnopabcdefghijklmnop \
    CHROME_WEB_STORE_API_ORIGIN=https://chrome.example \
    FIREFOX_EXTENSION_ID=serial@megaflora.net \
    FIREFOX_JWT_ISSUER=test-issuer \
    FIREFOX_JWT_SECRET=test-secret \
    FIREFOX_ADDONS_API_ORIGIN=https://firefox.example/api/v5 \
    CURL_BIN="$fake_curl" \
    FAKE_CURL_LOG="$temp_dir/curl.log" \
    FAKE_STATUS_RESPONSE="${FAKE_STATUS_RESPONSE-}" \
    FAKE_FIREFOX_VERSIONS_RESPONSE="${FAKE_FIREFOX_VERSIONS_RESPONSE-}" \
    "$readiness_check"
}

: > "$temp_dir/curl.log"
FAKE_STATUS_RESPONSE='{}'
FAKE_FIREFOX_VERSIONS_RESPONSE='{"results":[{"version":"2026.214.10.1","file":{"status":"public"}}]}'
export FAKE_STATUS_RESPONSE FAKE_FIREFOX_VERSIONS_RESPONSE
run_readiness_check > "$temp_dir/ready.out"
if ! grep -q "ready for a synchronized" "$temp_dir/ready.out"; then
  echo "Ready stores did not pass the synchronized release gate" >&2
  exit 1
fi

: > "$temp_dir/curl.log"
FAKE_STATUS_RESPONSE='{"submittedItemRevisionStatus":{"state":"PENDING_REVIEW","distributionChannels":[{"crxVersion":"2026.215.10.1"}]}}'
FAKE_FIREFOX_VERSIONS_RESPONSE='{"results":[{"version":"2026.215.10.1","file":{"status":"unreviewed"}}]}'
export FAKE_STATUS_RESPONSE FAKE_FIREFOX_VERSIONS_RESPONSE
if run_readiness_check >"$temp_dir/blocked.out" 2>&1; then
  echo "Expected active store reviews to block the synchronized release" >&2
  exit 1
fi
if ! grep -q "Chrome revision" "$temp_dir/blocked.out" || \
  ! grep -q "Firefox revision" "$temp_dir/blocked.out" || \
  ! grep -q "synchronized browser-extension release is blocked" "$temp_dir/blocked.out"; then
  echo "The synchronized release gate did not report both active reviews" >&2
  exit 1
fi

echo "Extension deployment checks passed."
