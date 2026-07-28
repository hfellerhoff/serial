#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
dist_dir="$repo_root/apps/www/dist"
manifest_name=".serial-www-deploy-manifest-v1"
upload_concurrency="${BUNNY_UPLOAD_CONCURRENCY:-20}"
curl_bin="${CURL_BIN:-curl}"

for name in BUNNY_STORAGE_HOSTNAME BUNNY_STORAGE BUNNY_API_STORAGE; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done

if [[ ! -d "$dist_dir" ]]; then
  echo "Website build output does not exist: $dist_dir" >&2
  exit 1
fi
if [[ ! "$upload_concurrency" =~ ^[1-9][0-9]*$ ]]; then
  echo "BUNNY_UPLOAD_CONCURRENCY must be a positive integer" >&2
  exit 1
fi

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
current_manifest="$temp_dir/current-manifest"
previous_manifest="$temp_dir/previous-manifest"
stale_manifest="$temp_dir/stale-manifest"
: > "$current_manifest"

while IFS= read -r -d '' file; do
  remote_path="${file#"$dist_dir"/}"
  if [[ "$remote_path" == *$'\n'* || "$remote_path" == *$'\r'* ]]; then
    echo "Bunny deployment does not support newlines in file names: $remote_path" >&2
    exit 1
  fi
  printf '%s\n' "$remote_path" >> "$current_manifest"
done < <(find "$dist_dir" -type f -print0)
LC_ALL=C sort -o "$current_manifest" "$current_manifest"

manifest_url="https://$BUNNY_STORAGE_HOSTNAME/$BUNNY_STORAGE/$manifest_name"
if ! manifest_status="$(
  "$curl_bin" --show-error --silent \
    --retry 4 --retry-all-errors --connect-timeout 15 --max-time 120 \
    --output "$previous_manifest" --write-out "%{http_code}" \
    -H "AccessKey: $BUNNY_API_STORAGE" \
    "$manifest_url"
)"; then
  echo "Failed to download the previous Bunny deployment manifest" >&2
  exit 1
fi

case "$manifest_status" in
  200) ;;
  404)
    : > "$previous_manifest"
    echo "No prior deployment manifest found; stale-file cleanup will begin with the next deployment."
    ;;
  *)
    echo "Bunny Storage returned HTTP $manifest_status while reading the deployment manifest" >&2
    exit 1
    ;;
esac

while IFS= read -r remote_path; do
  [[ -z "$remote_path" ]] && continue
  case "/$remote_path/" in
    *"/../"* | *"/./"* | *"//"*)
      echo "Previous deployment manifest contains an unsafe path: $remote_path" >&2
      exit 1
      ;;
  esac
  if [[ "$remote_path" == /* || "$remote_path" == *$'\r'* || "$remote_path" == "$manifest_name" ]]; then
    echo "Previous deployment manifest contains an unsafe path: $remote_path" >&2
    exit 1
  fi
done < "$previous_manifest"

echo "Uploading $(wc -l < "$current_manifest" | tr -d ' ') website files..."
find "$dist_dir" -type f -print0 |
  xargs -0 -r -n 1 -P "$upload_concurrency" "$script_dir/upload-to-bunny.sh"

LC_ALL=C sort -u -o "$previous_manifest" "$previous_manifest"
LC_ALL=C comm -23 "$previous_manifest" "$current_manifest" > "$stale_manifest"
while IFS= read -r remote_path; do
  [[ -z "$remote_path" ]] && continue
  "$script_dir/delete-from-bunny.sh" "$remote_path"
done < "$stale_manifest"

"$script_dir/upload-to-bunny.sh" "$current_manifest" "$manifest_name"
