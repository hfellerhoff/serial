#!/usr/bin/env bash

set -euo pipefail

output_dir="${1:?usage: collect-store-packages.sh <output-dir> <destination-dir> <release-version>}"
destination_dir="${2:?usage: collect-store-packages.sh <output-dir> <destination-dir> <release-version>}"
release_version="${3:?usage: collect-store-packages.sh <output-dir> <destination-dir> <release-version>}"

shopt -s nullglob
chrome_candidates=("$output_dir"/*-"$release_version"-chrome.zip)
firefox_candidates=("$output_dir"/*-"$release_version"-firefox.zip)
source_candidates=("$output_dir"/*-"$release_version"-sources.zip)
shopt -u nullglob

require_single_package() {
  local label="$1"
  shift

  if (( $# != 1 )); then
    echo "Expected one $label package for version $release_version, found $#" >&2
    exit 1
  fi
}

require_single_package Chrome "${chrome_candidates[@]}"
require_single_package Firefox "${firefox_candidates[@]}"
require_single_package "Firefox source" "${source_candidates[@]}"

mkdir -p "$destination_dir"
cp "${chrome_candidates[0]}" "$destination_dir/chrome.zip"
cp "${firefox_candidates[0]}" "$destination_dir/firefox.zip"
cp "${source_candidates[0]}" "$destination_dir/firefox-sources.zip"

for browser in chrome firefox; do
  manifest="$(unzip -p "$destination_dir/$browser.zip" manifest.json)"
  manifest_version="$(jq -r '.version' <<< "$manifest")"
  if [[ "$manifest_version" != "$release_version" ]]; then
    echo \
      "$browser package version $manifest_version does not match $release_version" \
      >&2
    exit 1
  fi

  if jq -e 'has("key")' <<< "$manifest" >/dev/null; then
    echo "$browser store package contains the development-only manifest key" >&2
    exit 1
  fi
done

required_source_paths=(
  .gitignore
  .node-version
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  apps/extension/package.json
  apps/extension/scripts/check-firefox-lint.mjs
  apps/extension/wxt.config.ts
  apps/extension/entrypoints/background.ts
  packages/bookmark-capture/package.json
  packages/extension-identity/package.json
  packages/ui/package.json
)
source_listing="$(unzip -Z1 "$destination_dir/firefox-sources.zip")"
for path in "${required_source_paths[@]}"; do
  if ! grep -Fxq "$path" <<< "$source_listing"; then
    echo "Firefox source package is missing $path" >&2
    exit 1
  fi
done

if grep -Eq '(^|/)(node_modules|\.output|\.wxt|\.turbo)/' \
  <<< "$source_listing"; then
  echo "Firefox source package contains generated files" >&2
  exit 1
fi

sha256sum "$destination_dir"/*.zip
