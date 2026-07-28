#!/usr/bin/env bash

set -euo pipefail

remote_path="${1:?usage: delete-from-bunny.sh REMOTE_PATH}"
curl_bin="${CURL_BIN:-curl}"

for name in WWW_BUNNY_STORAGE_ZONE_ENDPOINT WWW_BUNNY_STORAGE_ZONE_NAME WWW_BUNNY_STORAGE_ZONE_PASSWORD; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done

case "/$remote_path/" in
  *"/../"* | *"/./"* | *"//"*)
    echo "Refusing unsafe remote path: $remote_path" >&2
    exit 1
    ;;
esac
if [[ "$remote_path" == /* || "$remote_path" == *$'\n'* || "$remote_path" == *$'\r'* ]]; then
  echo "Refusing unsafe remote path: $remote_path" >&2
  exit 1
fi

encoded_path="$(python3 -c 'import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe="/"))' "$remote_path")"
if ! http_status="$(
  "$curl_bin" --show-error --silent \
    --retry 4 --retry-all-errors --connect-timeout 15 --max-time 120 \
    --output /dev/null --write-out "%{http_code}" \
    -X DELETE \
    -H "AccessKey: $WWW_BUNNY_STORAGE_ZONE_PASSWORD" \
    "https://$WWW_BUNNY_STORAGE_ZONE_ENDPOINT/$WWW_BUNNY_STORAGE_ZONE_NAME/$encoded_path"
)"; then
  echo "Failed to delete $remote_path from Bunny Storage" >&2
  exit 1
fi

case "$http_status" in
  200) echo "✓ deleted $remote_path" ;;
  404) echo "✓ already absent $remote_path" ;;
  *)
    echo "Bunny Storage returned HTTP $http_status while deleting $remote_path" >&2
    exit 1
    ;;
esac
