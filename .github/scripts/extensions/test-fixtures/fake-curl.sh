#!/usr/bin/env bash

set -euo pipefail

method=GET
output_file=""
url=""

while (( $# > 0 )); do
  case "$1" in
    --request)
      method="$2"
      shift 2
      ;;
    --output)
      output_file="$2"
      shift 2
      ;;
    --header | --retry | --connect-timeout | --max-time | --upload-file | --data)
      shift 2
      ;;
    --fail-with-body | --show-error | --silent | --retry-all-errors)
      shift
      ;;
    http*)
      url="$1"
      shift
      ;;
    *)
      echo "Unexpected fake curl argument: $1" >&2
      exit 1
      ;;
  esac
done

: "${FAKE_CURL_LOG:?FAKE_CURL_LOG must be set}"
: "${output_file:?fake curl expected --output}"
: "${url:?fake curl expected a URL}"

printf '%s %s\n' "$method" "$url" >> "$FAKE_CURL_LOG"

case "$url" in
  *:fetchStatus)
    response="${FAKE_STATUS_RESPONSE-}"
    endpoint=status
    ;;
  *:upload)
    response="${FAKE_UPLOAD_RESPONSE-}"
    endpoint=upload
    ;;
  *:publish)
    response="${FAKE_PUBLISH_RESPONSE-}"
    endpoint=publish
    ;;
  */addons/addon/*/versions/*)
    response="${FAKE_FIREFOX_VERSIONS_RESPONSE-}"
    endpoint=firefox-versions
    ;;
  *)
    echo "Unexpected fake Chrome endpoint: $url" >&2
    exit 1
    ;;
esac

if [[ -z "$response" ]]; then
  response='{}'
fi

printf '%s\n' "$response" > "$output_file"

if [[ "${FAKE_FAIL_ENDPOINT:-}" == "$endpoint" ]]; then
  exit 22
fi
