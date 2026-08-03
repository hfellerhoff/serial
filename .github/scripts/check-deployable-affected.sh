#!/usr/bin/env bash

set -euo pipefail

deployable="${1:?usage: check-deployable-affected.sh <app|extension|www>}"
before_sha="${BEFORE_SHA:-}"
head_sha="${GITHUB_SHA:-HEAD}"
event_name="${GITHUB_EVENT_NAME:-}"
output_file="${GITHUB_OUTPUT:?GITHUB_OUTPUT must be set}"

case "$deployable" in
  app)
    task_id="@serial/app#build:artifact"
    ;;
  extension)
    task_id="@serial/extension#build:artifact"
    ;;
  www)
    task_id="@serial/www#build:artifact"
    ;;
  *)
    echo "Unknown deployable: $deployable" >&2
    exit 1
    ;;
esac

set_affected() {
  echo "$deployable=$1" >> "$output_file"
}

if [[ "$event_name" == "workflow_dispatch" ]]; then
  set_affected true
  exit 0
fi

# A missing base can occur on a repository's first push or after a force-push.
# Deploying is safer than silently skipping when the comparison is unavailable.
if [[ -z "$before_sha" ]] || ! git cat-file -e "${before_sha}^{commit}" 2>/dev/null; then
  set_affected true
  exit 0
fi

while IFS= read -r changed_file; do
  case "$deployable:$changed_file" in
    app:package.json | \
      app:pnpm-lock.yaml | \
      app:pnpm-workspace.yaml | \
      app:turbo.json | \
      app:.node-version | \
      app:.dockerignore | \
      app:Dockerfile | \
      app:.github/workflows/deploy-app.yml | \
      app:.github/scripts/check-deployable-affected.sh | \
      extension:package.json | \
      extension:pnpm-lock.yaml | \
      extension:pnpm-workspace.yaml | \
      extension:turbo.json | \
      extension:.node-version | \
      extension:.github/workflows/deploy-extension.yml | \
      extension:.github/scripts/check-deployable-affected.sh | \
      extension:.github/scripts/extensions/* | \
      www:package.json | \
      www:pnpm-lock.yaml | \
      www:pnpm-workspace.yaml | \
      www:turbo.json | \
      www:.node-version | \
      www:.github/workflows/deploy-www.yml | \
      www:.github/scripts/check-deployable-affected.sh | \
      www:.github/scripts/www/*)
      set_affected true
      exit 0
      ;;
  esac
done < <(git diff --name-only --no-renames "$before_sha" "$head_sha")

affected_json="$(
  TURBO_SCM_BASE="$before_sha" TURBO_SCM_HEAD="$head_sha" \
    pnpm exec turbo run build:artifact --affected --dry=json
)"
if ! jq -e '.tasks | type == "array"' <<< "$affected_json" > /dev/null; then
  echo "Turbo returned invalid affected-task output" >&2
  exit 1
fi
if jq -e --arg task_id "$task_id" \
  '.tasks[] | select(.taskId == $task_id)' \
  <<< "$affected_json" > /dev/null; then
  set_affected true
else
  set_affected false
fi
