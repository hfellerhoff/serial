#!/usr/bin/env bash

set -euo pipefail

file="${1:?usage: upload-to-bunny.sh FILE [REMOTE_PATH]}"
remote_path="${2:-}"
curl_bin="${CURL_BIN:-curl}"

for name in BUNNY_STORAGE_HOSTNAME BUNNY_STORAGE BUNNY_API_STORAGE; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done

if [[ ! -f "$file" ]]; then
  echo "Upload source does not exist: $file" >&2
  exit 1
fi

if [[ -z "$remote_path" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  dist_dir="$(cd "$script_dir/../../../apps/www/dist" && pwd)"
  case "$file" in
    apps/www/dist/*) remote_path="${file#apps/www/dist/}" ;;
    "$dist_dir"/*) remote_path="${file#"$dist_dir"/}" ;;
    *)
      echo "REMOTE_PATH is required when FILE is outside apps/www/dist" >&2
      exit 1
      ;;
  esac
fi

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
"$curl_bin" --fail-with-body --show-error --silent \
  --retry 4 --retry-all-errors --connect-timeout 15 --max-time 120 \
  -X PUT \
  -H "AccessKey: $BUNNY_API_STORAGE" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@$file" \
  "https://$BUNNY_STORAGE_HOSTNAME/$BUNNY_STORAGE/$encoded_path"
echo "✓ uploaded $remote_path"
