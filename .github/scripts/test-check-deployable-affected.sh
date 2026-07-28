#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
checker="$script_dir/check-deployable-affected.sh"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

fixture_repo="$temp_dir/repo"
fake_bin="$temp_dir/bin"
mkdir -p "$fixture_repo/apps/app" "$fixture_repo/apps/www" "$fake_bin"

git -C "$fixture_repo" init --quiet
git -C "$fixture_repo" config user.email "deployment-test@example.com"
git -C "$fixture_repo" config user.name "Deployment Test"
printf 'base\n' > "$fixture_repo/apps/app/source.txt"
printf 'base\n' > "$fixture_repo/apps/www/source.txt"
git -C "$fixture_repo" add .
git -C "$fixture_repo" commit --quiet -m "base"

base_sha="$(git -C "$fixture_repo" rev-parse HEAD)"

printf '%s\n' '#!/usr/bin/env bash' > "$fake_bin/pnpm"
printf '%s\n' \
  'set -euo pipefail' \
  'if [[ "${FAIL_FAKE_PNPM:-}" == "true" ]]; then exit 42; fi' \
  'changed_files="$(git diff --name-only "$TURBO_SCM_BASE" "$TURBO_SCM_HEAD")"' \
  'printf '\''{"tasks":['\''' \
  'separator=""' \
  'if grep -q "^apps/app/" <<< "$changed_files"; then' \
  '  printf '\''%s{"taskId":"@serial/app#build:artifact"}'\'' "$separator"' \
  '  separator=","' \
  'fi' \
  'if grep -q "^apps/www/" <<< "$changed_files"; then' \
  '  printf '\''%s{"taskId":"@serial/www#build:artifact"}'\'' "$separator"' \
  'fi' \
  'printf '\'']}\n'\''' >> "$fake_bin/pnpm"
chmod +x "$fake_bin/pnpm"

commit_change() {
  local path="$1"
  local value="$2"

  mkdir -p "$(dirname "$fixture_repo/$path")"
  printf '%s\n' "$value" > "$fixture_repo/$path"
  git -C "$fixture_repo" add "$path"
  git -C "$fixture_repo" commit --quiet -m "change $path"
  git -C "$fixture_repo" rev-parse HEAD
}

assert_affected() {
  local deployable="$1"
  local expected="$2"
  local before="$3"
  local head="$4"
  local event_name="${5:-push}"
  local output="$temp_dir/output"

  : > "$output"
  (
    cd "$fixture_repo"
    PATH="$fake_bin:$PATH" \
      GITHUB_EVENT_NAME="$event_name" \
      BEFORE_SHA="$before" \
      GITHUB_SHA="$head" \
      GITHUB_OUTPUT="$output" \
      "$checker" "$deployable"
  )

  local actual
  actual="$(cut -d= -f2 < "$output")"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $deployable=$expected, got $deployable=$actual" >&2
    exit 1
  fi
}

assert_detection_failure_is_not_masked() {
  local before="$1"
  local head="$2"
  local output="$temp_dir/output"

  : > "$output"
  if (
    cd "$fixture_repo"
    PATH="$fake_bin:$PATH" \
      FAIL_FAKE_PNPM=true \
      GITHUB_EVENT_NAME=push \
      BEFORE_SHA="$before" \
      GITHUB_SHA="$head" \
      GITHUB_OUTPUT="$output" \
      "$checker" app
  ); then
    echo "Expected a Turbo failure to fail change detection" >&2
    exit 1
  fi

  if [[ -s "$output" ]]; then
    echo "Change detection reported a result after Turbo failed" >&2
    exit 1
  fi
}

app_sha="$(commit_change "apps/app/source.txt" "app change")"
assert_affected app true "$base_sha" "$app_sha"
assert_affected www false "$base_sha" "$app_sha"

www_sha="$(commit_change "apps/www/source.txt" "website change")"
assert_affected app false "$app_sha" "$www_sha"
assert_affected www true "$app_sha" "$www_sha"
assert_detection_failure_is_not_masked "$app_sha" "$www_sha"

root_sha="$(commit_change "package.json" "{}")"
assert_affected app true "$www_sha" "$root_sha"
assert_affected www true "$www_sha" "$root_sha"

assert_affected app true "" "$root_sha" workflow_dispatch
assert_affected www true "0000000000000000000000000000000000000000" "$root_sha"

echo "Deployable affected checks passed."
